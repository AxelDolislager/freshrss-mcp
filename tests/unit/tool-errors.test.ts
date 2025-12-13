import { describe, expect, it } from 'vitest';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { mapErrorToMcp, wrapTool } from '../../src/utils/tool-errors.js';
import { AuthenticationError, FreshRSSError, NotFoundError } from '../../src/api/errors.js';

describe('mapErrorToMcp', () => {
  it('maps AuthenticationError to InvalidParams', () => {
    const err = new AuthenticationError('bad auth');
    const mapped = mapErrorToMcp('list_feeds', err);
    expect(mapped).toBeInstanceOf(McpError);
    expect(mapped.code).toBe(ErrorCode.InvalidParams);
    expect(mapped.message).toContain('authentication failed');
  });

  it('maps NotFoundError to InvalidParams', () => {
    const err = new NotFoundError('missing', '/x', 'GET');
    const mapped = mapErrorToMcp('list_articles', err);
    expect(mapped.code).toBe(ErrorCode.InvalidParams);
    expect(mapped.message).toContain('missing');
  });

  it('maps 5xx FreshRSSError to InternalError', () => {
    const err = new FreshRSSError('boom', 503, '/y', 'GET', true);
    const mapped = mapErrorToMcp('get_stats', err);
    expect(mapped.code).toBe(ErrorCode.InternalError);
    expect(mapped.message).toContain('server error');
  });

  it('maps 429 FreshRSSError to rate limit message', () => {
    const err = new FreshRSSError('rate', 429, '/y', 'GET', true);
    const mapped = mapErrorToMcp('list_feeds', err);
    expect(mapped.code).toBe(ErrorCode.InternalError);
    expect(mapped.message).toContain('rate limited');
  });

  it('includes response snippet for non-5xx FreshRSSError', () => {
    const err = new FreshRSSError('bad', 400, '/y', 'GET', false, '  hi  ');
    const mapped = mapErrorToMcp('list_articles', err);
    expect(mapped.message).toContain('Response snippet');
    expect(mapped.message).toContain('hi');
  });

  it('maps AbortError to RequestTimeout', () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    const mapped = mapErrorToMcp('list_articles', err);
    expect(mapped.code).toBe(ErrorCode.RequestTimeout);
  });

  it('maps ZodError to InvalidParams', () => {
    let err: unknown;
    try {
      z.object({ a: z.string() }).parse({});
    } catch (e) {
      err = e;
    }
    const mapped = mapErrorToMcp('subscribe', err);
    expect(mapped.code).toBe(ErrorCode.InvalidParams);
    expect(mapped.message).toContain('Invalid arguments');
  });

  it('passes through existing McpError', () => {
    const e = new McpError(ErrorCode.InternalError, 'x');
    expect(mapErrorToMcp('t', e)).toBe(e);
  });

  it('maps unknown values to InternalError', () => {
    const mapped = mapErrorToMcp('t', 'oops');
    expect(mapped.code).toBe(ErrorCode.InternalError);
    expect(mapped.message).toContain('Unexpected error');
  });

  it('maps generic Error to InternalError', () => {
    const mapped = mapErrorToMcp('t', new Error('boom'));
    expect(mapped.code).toBe(ErrorCode.InternalError);
    expect(mapped.message).toContain('Error in t: boom');
  });

  it('wrapTool converts thrown errors to McpError', async () => {
    const wrapped = wrapTool('t', () => Promise.reject(new Error('boom')));
    await expect(wrapped()).rejects.toBeInstanceOf(McpError);
  });
});
