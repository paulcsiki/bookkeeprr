import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  refreshLibrary,
  CalibreError,
  __setCalibreFetcherForTests,
  __resetCalibreForTests,
} from '@/server/library-sync/calibre';

beforeEach(() => __resetCalibreForTests());
afterEach(() => __resetCalibreForTests());

describe('refreshLibrary', () => {
  it('POSTs to /cdb/cmd/refresh-library/0?library_id={id}', async () => {
    let capturedUrl = '';
    let capturedMethod = '';
    __setCalibreFetcherForTests(async (url, init) => {
      capturedUrl = url;
      capturedMethod = init.method ?? 'GET';
      return { ok: true, status: 200, text: async () => '' };
    });
    await refreshLibrary(
      { baseUrl: 'http://calibre.local:8080', username: null, password: null },
      'main',
    );
    expect(capturedUrl).toBe('http://calibre.local:8080/cdb/cmd/refresh-library/0?library_id=main');
    expect(capturedMethod).toBe('POST');
  });

  it('adds Basic auth header when username + password set', async () => {
    let capturedAuth = '';
    __setCalibreFetcherForTests(async (_url, init) => {
      const headers = new Headers(init.headers);
      capturedAuth = headers.get('authorization') ?? '';
      return { ok: true, status: 200, text: async () => '' };
    });
    await refreshLibrary({ baseUrl: 'http://x', username: 'admin', password: 'hunter2' }, '0');
    // base64('admin:hunter2') = 'YWRtaW46aHVudGVyMg=='
    expect(capturedAuth).toBe('Basic YWRtaW46aHVudGVyMg==');
  });

  it('omits Basic auth header when creds null', async () => {
    let capturedAuth: string | null = '';
    __setCalibreFetcherForTests(async (_url, init) => {
      const headers = new Headers(init.headers);
      capturedAuth = headers.get('authorization');
      return { ok: true, status: 200, text: async () => '' };
    });
    await refreshLibrary({ baseUrl: 'http://x', username: null, password: null }, '0');
    expect(capturedAuth).toBeNull();
  });

  it('throws CalibreError on 401', async () => {
    __setCalibreFetcherForTests(async () => ({
      ok: false,
      status: 401,
      text: async () => '',
    }));
    const call = refreshLibrary({ baseUrl: 'http://x', username: null, password: null }, '0');
    await expect(call).rejects.toThrow(CalibreError);
    await expect(call).rejects.toThrow(/HTTP 401/);
  });

  it('throws CalibreError on network failure', async () => {
    __setCalibreFetcherForTests(async () => {
      throw new Error('econnrefused');
    });
    const call = refreshLibrary({ baseUrl: 'http://x', username: null, password: null }, '0');
    await expect(call).rejects.toThrow(CalibreError);
    await expect(call).rejects.toThrow(/fetch failed/);
  });
});
