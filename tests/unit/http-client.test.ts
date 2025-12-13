import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpClient } from '../../src/api/http-client.js';
import { AuthenticationError, FreshRSSError } from '../../src/api/errors.js';

const config = {
  baseUrl: 'http://example.com',
  username: 'user',
  apiPassword: 'pass',
};

function authResponse(): Response {
  return new Response('Auth=token123\n', { status: 200 });
}

describe('HttpClient error recovery', () => {
  const prevFetch = globalThis.fetch;
  const prevEnv = { ...process.env };

  beforeEach(() => {
    process.env.FRESHRSS_MAX_RETRIES = '1';
    process.env.FRESHRSS_RETRY_BASE_MS = '1';
    process.env.FRESHRSS_TIMEOUT_MS = '1000';
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    globalThis.fetch = prevFetch;
    process.env = prevEnv;
    vi.restoreAllMocks();
  });

  it('retries safe GET on transient 5xx', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(authResponse())
      .mockResolvedValueOnce(new Response('err', { status: 500, statusText: 'Oops' }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient(config);
    const res = await client.get<{ items: unknown[] }>('/reader/api/0/tag/list');
    expect(res.items).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('re-authenticates once on 401 and retries', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(authResponse())
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401, statusText: 'Nope' }))
      .mockResolvedValueOnce(authResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient(config);
    const res = await client.get<{ ok: boolean }>('/reader/api/0/user-info');
    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('authenticate errors are surfaced as AuthenticationError', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('nope', { status: 500, statusText: 'Oops' }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient(config);
    await expect(client.authenticate()).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('authenticate throws when token is missing', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('OK', { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient(config);
    await expect(client.authenticate()).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('ensureAuth returns auth token', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(authResponse());
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient(config);
    await expect(client.ensureAuth()).resolves.toBe('token123');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/greader.php/accounts/ClientLogin');
    expect(init.method).toBe('POST');
  });

  it('getActionToken errors on empty token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(authResponse())
      .mockResolvedValueOnce(new Response('  ', { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient(config);
    await expect(client.getActionToken()).rejects.toBeInstanceOf(FreshRSSError);
  });

  it('post encodes form data (including arrays) and parses JSON-ish responses', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(authResponse())
      .mockResolvedValueOnce(new Response('action123', { status: 200 }))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient(config);
    const res = await client.post<{ ok: boolean }>('/reader/api/0/edit-tag', {
      i: ['a', 'b'],
      a: 'user/-/state/com.google/read',
    });

    expect(res).toEqual({ ok: true });

    const postCall = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(postCall[0]).toContain('/api/greader.php/reader/api/0/edit-tag');
    expect(typeof postCall[1].body).toBe('string');
    const body = postCall[1].body as string;
    expect(body).toContain('T=action123');
    expect(body).toContain('i=a');
    expect(body).toContain('i=b');
  });

  it('get returns FreshRSSError on 404 (NotFoundError is wrapped)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(authResponse())
      .mockResolvedValueOnce(new Response('missing', { status: 404, statusText: 'Not Found' }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient(config);
    await expect(client.get('/reader/api/0/nope')).rejects.toBeInstanceOf(FreshRSSError);
  });

  it('get throws FreshRSSError on invalid JSON', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(authResponse())
      .mockResolvedValueOnce(
        new Response('not-json', { status: 200, headers: { 'content-type': 'application/json' } })
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient(config);
    await expect(client.get('/reader/api/0/tag/list')).rejects.toBeInstanceOf(FreshRSSError);
  });

  it('postFever computes api_key and posts JSON', async () => {
    const { createHash } = await import('node:crypto');
    const expected = createHash('md5').update('user:pass').digest('hex');

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: 1 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient(config);
    const res = await client.postFever<{ ok: number }>({ unread_item_ids: '1' });
    expect(res.ok).toBe(1);

    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(call[0]).toBe('http://example.com/api/fever.php');
    expect(typeof call[1].body).toBe('string');
    expect(call[1].body as string).toContain(`api_key=${expected}`);
  });

  it('ensureAuth throws if authenticate does not populate token', async () => {
    const client = new HttpClient(config);
    vi.spyOn(client, 'authenticate').mockResolvedValue(undefined);
    await expect(client.ensureAuth()).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('get adds query params and forces output=json', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(authResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient(config);
    await client.get('/reader/api/0/user-info', { q: 'a b', output: 'xml' });

    const call = fetchMock.mock.calls[1] as [string, RequestInit];
    const u = new URL(call[0]);
    expect(u.searchParams.get('q')).toBe('a b');
    expect(u.searchParams.get('output')).toBe('json');
  });

  it('getText adds query params but does not force output=json', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(authResponse())
      .mockResolvedValueOnce(new Response('hi', { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient(config);
    await expect(client.getText('/reader/api/0/subscription/export', { q: 'x' })).resolves.toBe(
      'hi'
    );

    const call = fetchMock.mock.calls[1] as [string, RequestInit];
    const u = new URL(call[0]);
    expect(u.searchParams.get('q')).toBe('x');
    expect(u.searchParams.get('output')).toBe(null);
  });

  it('post returns plain text responses as-is', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(authResponse())
      .mockResolvedValueOnce(new Response('action123', { status: 200 }))
      .mockResolvedValueOnce(new Response('OK', { status: 200 }));

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient(config);
    await expect(
      client.post('/reader/api/0/edit-tag', { i: ['a'], a: 'user/-/state/com.google/read' })
    ).resolves.toBe('OK');
  });

  it('post returns raw text when JSON parsing fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(authResponse())
      .mockResolvedValueOnce(new Response('action123', { status: 200 }))
      .mockResolvedValueOnce(new Response('{notjson', { status: 200 }));

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient(config);
    await expect(
      client.post('/reader/api/0/edit-tag', { i: ['a'], a: 'user/-/state/com.google/read' })
    ).resolves.toBe('{notjson');
  });

  it('postRaw sends body and content-type without action token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(authResponse())
      .mockResolvedValueOnce(new Response('OK', { status: 200 }));

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient(config);
    await client.postRaw('/reader/api/0/subscription/import', '<opml/>', 'application/xml');

    const call = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(call[0]).toContain('/reader/api/0/subscription/import');
    expect(call[1].headers).toMatchObject({ 'Content-Type': 'application/xml' });
    expect(typeof call[1].body).toBe('string');
    expect(call[1].body).toBe('<opml/>');
  });
});
