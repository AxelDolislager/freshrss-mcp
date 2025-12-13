import { afterEach, describe, expect, it, vi } from 'vitest';
import { FreshRSSClient } from '../../src/api/client.js';

describe('FreshRSSClient', () => {
  const prevFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = prevFetch;
  });

  it('constructs services and authenticates', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('Auth=token123\n', { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new FreshRSSClient({
      baseUrl: 'http://example.com',
      username: 'u',
      apiPassword: 'p',
    });

    expect(client.articles).toBeDefined();
    expect(client.feeds).toBeDefined();
    expect(client.tags).toBeDefined();
    expect(client.stats).toBeDefined();
    expect(client.fever).toBeDefined();

    await client.authenticate();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
