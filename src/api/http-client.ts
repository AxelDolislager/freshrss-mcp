import type { AuthState, FreshRSSConfig } from '../types/index.js';
import { AuthenticationError, FreshRSSError, NotFoundError } from './errors.js';

type RetryPolicy = 'none' | 'safe' | 'always';

/**
 * Handles HTTP communication with the FreshRSS API
 */
export class HttpClient {
  private auth: AuthState | null = null;
  private feverKey: string | null = null;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseMs: number;

  constructor(private readonly config: FreshRSSConfig) {
    const timeoutEnv = Number(process.env.FRESHRSS_TIMEOUT_MS ?? '');
    this.timeoutMs = Number.isFinite(timeoutEnv) && timeoutEnv > 0 ? timeoutEnv : 15000;

    const retriesEnv = Number(process.env.FRESHRSS_MAX_RETRIES ?? '');
    this.maxRetries = Number.isFinite(retriesEnv) && retriesEnv >= 0 ? retriesEnv : 2;

    const retryBaseEnv = Number(process.env.FRESHRSS_RETRY_BASE_MS ?? '');
    this.retryBaseMs = Number.isFinite(retryBaseEnv) && retryBaseEnv > 0 ? retryBaseEnv : 300;
  }

  /**
   * Build the API URL for a given endpoint
   */
  private buildUrl(endpoint: string): string {
    const base = this.config.baseUrl.replace(/\/$/, '');
    return `${base}/api/greader.php${endpoint}`;
  }

  private buildFeverUrl(): string {
    const base = this.config.baseUrl.replace(/\/$/, '');
    return `${base}/api/fever.php`;
  }

  private shouldRetry(status: number): boolean {
    return status === 408 || status === 429 || (status >= 500 && status <= 504);
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async retryDelay(attempt: number): Promise<void> {
    const exp = Math.min(6, attempt);
    const base = this.retryBaseMs * Math.pow(2, exp);
    const jitter = Math.floor(Math.random() * this.retryBaseMs);
    await this.sleep(base + jitter);
  }

  private async readSnippet(response: Response): Promise<string | undefined> {
    try {
      const text = await response.text();
      const trimmed = text.trim();
      if (trimmed === '') return undefined;
      return trimmed.slice(0, 500);
    } catch {
      return undefined;
    }
  }

  private async request<T>(
    url: string,
    init: RequestInit,
    meta: {
      endpoint: string;
      method: string;
      expectJson: boolean;
      retryPolicy: RetryPolicy;
      allowAuthRetry: boolean;
    }
  ): Promise<T | string> {
    const { endpoint, method, expectJson, retryPolicy, allowAuthRetry } = meta;
    const maxAttempts = retryPolicy === 'none' ? 0 : this.maxRetries;
    let didAuthRetry = false;

    for (let attempt = 0; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
      }, this.timeoutMs);
      try {
        const response = await fetch(url, { ...init, signal: controller.signal });

        if (
          (response.status === 401 || response.status === 403) &&
          allowAuthRetry &&
          !didAuthRetry
        ) {
          didAuthRetry = true;
          this.auth = null;
          await this.authenticate();
          continue;
        }

        if (!response.ok) {
          const snippet = await this.readSnippet(response.clone());
          if (response.status === 404) {
            throw new NotFoundError(
              `Resource not found for ${endpoint}`,
              endpoint,
              method,
              snippet
            );
          }

          const retriable = this.shouldRetry(response.status);
          if (retriable && attempt < maxAttempts) {
            await this.retryDelay(attempt);
            continue;
          }

          throw new FreshRSSError(
            `API request failed: ${response.status.toString()} ${response.statusText}`,
            response.status,
            endpoint,
            method,
            retriable,
            snippet
          );
        }

        if (expectJson) {
          try {
            return (await response.json()) as T;
          } catch (err) {
            const snippet = await this.readSnippet(response.clone());
            throw new FreshRSSError(
              `Invalid JSON response from ${endpoint}`,
              response.status,
              endpoint,
              method,
              false,
              snippet,
              err instanceof Error ? err : undefined
            );
          }
        }

        return await response.text();
      } catch (err) {
        const isAbort = err instanceof Error && err.name === 'AbortError';
        const message = isAbort
          ? `Request to ${endpoint} timed out after ${this.timeoutMs.toString()}ms`
          : `Network error while calling ${endpoint}`;

        const retriable = retryPolicy !== 'none';
        if (retriable && attempt < maxAttempts && !isAbort) {
          await this.retryDelay(attempt);
          continue;
        }

        throw new FreshRSSError(
          message,
          undefined,
          endpoint,
          method,
          retriable,
          undefined,
          err instanceof Error ? err : undefined
        );
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new FreshRSSError(`API request failed for ${endpoint}`, undefined, endpoint, method);
  }

  /**
   * Authenticate with FreshRSS
   */
  async authenticate(): Promise<void> {
    const endpoint = '/accounts/ClientLogin';
    const url = this.buildUrl(endpoint);
    const body = new URLSearchParams({
      Email: this.config.username,
      Passwd: this.config.apiPassword,
    });

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
    } catch (err) {
      throw new AuthenticationError(
        'Authentication failed: network error',
        err instanceof Error ? err : undefined
      );
    }

    if (!response.ok) {
      const snippet = await this.readSnippet(response.clone());
      throw new AuthenticationError(
        `Authentication failed: ${response.status.toString()} ${response.statusText}`,
        undefined,
        snippet
      );
    }

    const text = await response.text();
    const authToken = this.extractAuthToken(text);

    if (authToken === null) {
      const snippet = text.trim().slice(0, 200);
      throw new AuthenticationError(
        'Failed to extract auth token from response',
        undefined,
        snippet
      );
    }

    this.auth = { authToken };
  }

  private extractAuthToken(text: string): string | null {
    for (const line of text.split('\n')) {
      if (line.startsWith('Auth=')) {
        return line.substring(5);
      }
    }
    return null;
  }

  /**
   * Ensure we have a valid auth token
   */
  async ensureAuth(): Promise<string> {
    if (this.auth === null) {
      await this.authenticate();
    }
    if (this.auth === null) {
      throw new AuthenticationError('Authentication failed: no auth token available');
    }
    return this.auth.authToken;
  }

  /**
   * Get action token for write operations
   */
  async getActionToken(): Promise<string> {
    const authToken = await this.ensureAuth();
    const endpoint = '/reader/api/0/token';
    const url = this.buildUrl(endpoint);
    const responseText = await this.request<string>(
      url,
      { headers: { Authorization: `GoogleLogin auth=${authToken}` } },
      {
        endpoint,
        method: 'GET',
        expectJson: false,
        retryPolicy: 'safe',
        allowAuthRetry: true,
      }
    );

    const token = responseText.trim();
    if (token === '') {
      throw new FreshRSSError(
        'Failed to get action token: empty response',
        undefined,
        endpoint,
        'GET'
      );
    }

    if (this.auth !== null) {
      this.auth.actionToken = token;
    }
    return token;
  }

  /**
   * Make an authenticated GET request
   */
  async get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const authToken = await this.ensureAuth();
    const url = new URL(this.buildUrl(endpoint));

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }
    url.searchParams.set('output', 'json');

    return (await this.request<T>(
      url.toString(),
      { headers: { Authorization: `GoogleLogin auth=${authToken}` } },
      {
        endpoint,
        method: 'GET',
        expectJson: true,
        retryPolicy: 'safe',
        allowAuthRetry: true,
      }
    )) as T;
  }

  /**
   * Make an authenticated GET request that returns raw text (no forced output=json).
   */
  async getText(endpoint: string, params?: Record<string, string>): Promise<string> {
    const authToken = await this.ensureAuth();
    const url = new URL(this.buildUrl(endpoint));

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    return await this.request<string>(
      url.toString(),
      { headers: { Authorization: `GoogleLogin auth=${authToken}` } },
      {
        endpoint,
        method: 'GET',
        expectJson: false,
        retryPolicy: 'safe',
        allowAuthRetry: true,
      }
    );
  }

  /**
   * Make an authenticated POST request
   */
  async post<T>(endpoint: string, body: Record<string, string | string[]>): Promise<T | string> {
    const authToken = await this.ensureAuth();
    const actionToken = await this.getActionToken();

    const formBody = new URLSearchParams();
    formBody.set('T', actionToken);

    for (const [key, value] of Object.entries(body)) {
      if (Array.isArray(value)) {
        for (const v of value) {
          formBody.append(key, v);
        }
      } else {
        formBody.set(key, value);
      }
    }

    const url = this.buildUrl(endpoint);
    const result = await this.request<T>(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `GoogleLogin auth=${authToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formBody.toString(),
      },
      {
        endpoint,
        method: 'POST',
        expectJson: false,
        retryPolicy: 'none',
        allowAuthRetry: true,
      }
    );

    const contentTypeGuess =
      typeof result === 'string'
        ? result.trim().startsWith('{')
          ? 'application/json'
          : 'text/plain'
        : '';
    if (contentTypeGuess.includes('application/json')) {
      try {
        return JSON.parse(result as string) as T;
      } catch {
        return result;
      }
    }

    return result;
  }

  /**
   * POST a raw body to greader endpoints (no action token injected).
   */
  async postRaw(
    endpoint: string,
    bodyText: string,
    contentType = 'application/xml'
  ): Promise<string> {
    const authToken = await this.ensureAuth();
    const url = this.buildUrl(endpoint);

    return await this.request<string>(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `GoogleLogin auth=${authToken}`,
          'Content-Type': contentType,
        },
        body: bodyText,
      },
      {
        endpoint,
        method: 'POST',
        expectJson: false,
        retryPolicy: 'none',
        allowAuthRetry: true,
      }
    );
  }

  private async ensureFeverKey(): Promise<string> {
    if (this.feverKey !== null) return this.feverKey;
    const { createHash } = await import('node:crypto');
    const hashHex = createHash('md5')
      .update(`${this.config.username}:${this.config.apiPassword}`)
      .digest('hex');
    this.feverKey = hashHex;
    return hashHex;
  }

  /**
   * Make a Fever API POST request.
   */
  async postFever<T>(body: Record<string, string>): Promise<T> {
    const apiKey = await this.ensureFeverKey();
    const formBody = new URLSearchParams({ api_key: apiKey, ...body });
    const endpoint = '/api/fever.php';
    const url = this.buildFeverUrl();

    return (await this.request<T>(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody.toString(),
      },
      {
        endpoint,
        method: 'POST',
        expectJson: true,
        retryPolicy: 'safe',
        allowAuthRetry: false,
      }
    )) as T;
  }
}
