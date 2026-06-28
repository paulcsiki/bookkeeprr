import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  __setAudnexFetcherForTests,
  __resetAudnexForTests,
} from '@/server/integrations/audnex/client';
import { GET } from '@/app/api/discover/resolve-audiobook/route';
import type { ResolveAudiobookResult } from '@/app/api/discover/resolve-audiobook/route';

function req(params: Record<string, string>): Request {
  const qs = new URLSearchParams(params);
  return new Request(`http://localhost/api/discover/resolve-audiobook?${qs.toString()}`);
}

function audnexBook(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    asin: 'B00ASIN123',
    title: 'The Silent Hour',
    authors: [{ name: 'Jane Doe' }],
    narrators: [{ name: 'Narrator X' }],
    releaseDate: '2021-05-04',
    image: 'https://audible/cover.jpg',
    runtimeLengthMin: 600,
    ...overrides,
  };
}

beforeEach(() => {
  __resetAudnexForTests();
});
afterEach(() => {
  __resetAudnexForTests();
});

describe('GET /api/discover/resolve-audiobook', () => {
  it('returns the top Audible hit asin + fields', async () => {
    let requestedUrl = '';
    __setAudnexFetcherForTests(async (url) => {
      requestedUrl = url;
      return { ok: true, status: 200, text: async () => JSON.stringify([audnexBook()]) };
    });

    const res = await GET(req({ title: 'The Silent Hour', author: 'Jane Doe' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: ResolveAudiobookResult };
    expect(body.result).not.toBeNull();
    expect(body.result!.asin).toBe('B00ASIN123');
    expect(body.result!.title).toBe('The Silent Hour');
    expect(body.result!.author).toBe('Jane Doe');
    expect(body.result!.coverUrl).toBe('https://audible/cover.jpg');
    // searches Audible with "title author"
    expect(requestedUrl).toContain('title=The+Silent+Hour+Jane+Doe');
  });

  it('returns null when Audible has no match', async () => {
    __setAudnexFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify([]),
    }));

    const res = await GET(req({ title: 'Nothing Here', author: '' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: ResolveAudiobookResult };
    expect(body.result).toBeNull();
  });

  it('rejects a missing title with 400', async () => {
    const res = await GET(req({ author: 'Jane Doe' }));
    expect(res.status).toBe(400);
  });

  it('returns 502 when the Audible lookup fails', async () => {
    __setAudnexFetcherForTests(async () => ({ ok: false, status: 503, text: async () => '' }));
    const res = await GET(req({ title: 'Boom', author: '' }));
    expect(res.status).toBe(502);
  });
});
