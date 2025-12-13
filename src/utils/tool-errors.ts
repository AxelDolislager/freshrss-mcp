import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { AuthenticationError, FreshRSSError, NotFoundError } from '../api/index.js';

function formatSnippet(snippet?: string): string {
  if (snippet === undefined || snippet.trim() === '') return '';
  return `\nResponse snippet: ${snippet}`;
}

export function mapErrorToMcp(toolName: string, error: unknown): McpError {
  if (error instanceof McpError) return error;

  if (error instanceof AuthenticationError) {
    return new McpError(
      ErrorCode.InvalidParams,
      'FreshRSS authentication failed. Verify FRESHRSS_URL, FRESHRSS_USERNAME, and FRESHRSS_API_PASSWORD, and ensure the API is enabled.'
    );
  }

  if (error instanceof NotFoundError) {
    return new McpError(ErrorCode.InvalidParams, error.message);
  }

  if (error instanceof FreshRSSError) {
    const status = error.statusCode;
    if (status === 429) {
      return new McpError(
        ErrorCode.InternalError,
        `FreshRSS rate limited the request for ${toolName}. Please retry shortly.`
      );
    }
    if (status !== undefined && status >= 500) {
      return new McpError(
        ErrorCode.InternalError,
        `FreshRSS server error (${status.toString()}) while running ${toolName}. Please retry later.`
      );
    }
    return new McpError(
      ErrorCode.InternalError,
      `${error.message}${formatSnippet(error.responseSnippet)}`
    );
  }

  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return new McpError(
        ErrorCode.RequestTimeout,
        `FreshRSS request timed out while running ${toolName}. Try again.`
      );
    }
    if (error.name === 'ZodError') {
      return new McpError(
        ErrorCode.InvalidParams,
        `Invalid arguments for ${toolName}: ${error.message}`
      );
    }
    return new McpError(ErrorCode.InternalError, `Error in ${toolName}: ${error.message}`);
  }

  return new McpError(ErrorCode.InternalError, `Unexpected error in ${toolName}: ${String(error)}`);
}

export function wrapTool<TResult>(
  toolName: string,
  fn: () => Promise<TResult>
): () => Promise<TResult>;
export function wrapTool<TArgs, TResult>(
  toolName: string,
  fn: (args: TArgs) => Promise<TResult>
): (args: TArgs) => Promise<TResult>;
export function wrapTool(
  toolName: string,
  fn: (...args: unknown[]) => Promise<unknown>
): (...args: unknown[]) => Promise<unknown> {
  return async (...args: unknown[]): Promise<unknown> => {
    try {
      return await fn(...args);
    } catch (err) {
      throw mapErrorToMcp(toolName, err);
    }
  };
}
