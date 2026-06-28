import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  solveGet,
  getCfClearance,
  FlaresolverrError,
} from '@/server/integrations/flaresolverr/client';

const ORIGINAL_FETCH = global.fetch;

function mockFetchJson(body: unknown, status = 200): void {
  global.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  ) as unknown as typeof fetch;
}

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe('solveGet', () => {
  it('posts to <baseUrl>/v1 with request.get and returns html + userAgent', async () => {
    const spy = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            status: 'ok',
            solution: { response: '<html>solved</html>', userAgent: 'Mozilla/5.0 CF' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    global.fetch = spy as unknown as typeof fetch;

    const out = await solveGet('http://flaresolverr:8191/', 'https://www.novelupdates.com/');
    expect(out.html).toBe('<html>solved</html>');
    expect(out.userAgent).toBe('Mozilla/5.0 CF');

    expect(spy).toHaveBeenCalledOnce();
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('http://flaresolverr:8191/v1');
    const payload = JSON.parse((init as RequestInit).body as string);
    expect(payload.cmd).toBe('request.get');
    expect(payload.url).toBe('https://www.novelupdates.com/');
    expect(payload.maxTimeout).toBe(60000);
  });

  it('honours a custom maxTimeoutMs', async () => {
    const spy = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({ status: 'ok', solution: { response: 'x' } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    global.fetch = spy as unknown as typeof fetch;
    await solveGet('http://fs:8191', 'https://x', { maxTimeoutMs: 12000 });
    const payload = JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string);
    expect(payload.maxTimeout).toBe(12000);
  });

  it('returns null userAgent when omitted', async () => {
    mockFetchJson({ status: 'ok', solution: { response: '<html/>' } });
    const out = await solveGet('http://fs:8191', 'https://x');
    expect(out.userAgent).toBeNull();
  });

  it('returns the solution cookies (empty array when omitted)', async () => {
    mockFetchJson({
      status: 'ok',
      solution: {
        response: '<html/>',
        cookies: [{ name: 'cf_clearance', value: 'abc', domain: '.novelupdates.com' }],
      },
    });
    const withCookies = await solveGet('http://fs:8191', 'https://x');
    expect(withCookies.cookies).toEqual([
      { name: 'cf_clearance', value: 'abc', domain: '.novelupdates.com' },
    ]);

    mockFetchJson({ status: 'ok', solution: { response: '<html/>' } });
    const without = await solveGet('http://fs:8191', 'https://x');
    expect(without.cookies).toEqual([]);
  });
});

describe('getCfClearance', () => {
  it('builds a Cookie header incl. cf_clearance from solution cookies + returns the UA', async () => {
    mockFetchJson({
      status: 'ok',
      solution: {
        response: '<html/>',
        userAgent: 'Mozilla/5.0 CF',
        cookies: [
          { name: 'cf_clearance', value: 'CLEAR', domain: '.cdn.novelupdates.com' },
          { name: '__cf_bm', value: 'BM', domain: '.cdn.novelupdates.com' },
        ],
      },
    });
    const out = await getCfClearance('http://fs:8191', 'https://cdn.novelupdates.com/');
    expect(out).not.toBeNull();
    expect(out!.cookie).toBe('cf_clearance=CLEAR; __cf_bm=BM');
    expect(out!.cookie).toContain('cf_clearance=CLEAR');
    expect(out!.userAgent).toBe('Mozilla/5.0 CF');
  });

  it('returns null when the solution has no cf_clearance cookie', async () => {
    mockFetchJson({
      status: 'ok',
      solution: {
        response: '<html/>',
        userAgent: 'UA',
        cookies: [{ name: '__cf_bm', value: 'BM' }],
      },
    });
    expect(await getCfClearance('http://fs:8191', 'https://x')).toBeNull();
  });

  it('returns null when there are no cookies at all', async () => {
    mockFetchJson({ status: 'ok', solution: { response: '<html/>', userAgent: 'UA' } });
    expect(await getCfClearance('http://fs:8191', 'https://x')).toBeNull();
  });

  it('propagates a FlaresolverrError when the solve fails', async () => {
    mockFetchJson({ status: 'error', message: 'challenge failed' });
    await expect(getCfClearance('http://fs:8191', 'https://x')).rejects.toBeInstanceOf(
      FlaresolverrError,
    );
  });

  it('throws FlaresolverrError when body.status !== ok', async () => {
    mockFetchJson({ status: 'error', message: 'challenge failed' });
    await expect(solveGet('http://fs:8191', 'https://x')).rejects.toBeInstanceOf(FlaresolverrError);
    await expect(solveGet('http://fs:8191', 'https://x')).rejects.toThrow(/challenge failed/);
  });

  it('throws FlaresolverrError on an HTTP error from FlareSolverr', async () => {
    mockFetchJson({}, 500);
    await expect(solveGet('http://fs:8191', 'https://x')).rejects.toBeInstanceOf(FlaresolverrError);
  });

  it('throws FlaresolverrError when fetch itself rejects', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    await expect(solveGet('http://fs:8191', 'https://x')).rejects.toBeInstanceOf(FlaresolverrError);
  });

  it('throws FlaresolverrError on an unexpected response shape', async () => {
    mockFetchJson({ unexpected: true });
    await expect(solveGet('http://fs:8191', 'https://x')).rejects.toBeInstanceOf(FlaresolverrError);
  });
});
