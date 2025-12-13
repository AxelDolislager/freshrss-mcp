/**
 * Custom error class for FreshRSS API errors
 */
export class FreshRSSError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly endpoint?: string,
    public readonly method?: string,
    public readonly retriable?: boolean,
    public readonly responseSnippet?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'FreshRSSError';
  }
}

/**
 * Error thrown when authentication fails
 */
export class AuthenticationError extends FreshRSSError {
  constructor(message: string, cause?: Error, responseSnippet?: string) {
    super(message, 401, '/accounts/ClientLogin', 'POST', false, responseSnippet, cause);
    this.name = 'AuthenticationError';
  }
}

/**
 * Error thrown when a resource is not found
 */
export class NotFoundError extends FreshRSSError {
  constructor(message: string, endpoint?: string, method?: string, responseSnippet?: string) {
    super(message, 404, endpoint, method, false, responseSnippet);
    this.name = 'NotFoundError';
  }
}
