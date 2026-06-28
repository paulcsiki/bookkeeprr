import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/series/search/route';
import * as cache from '@/server/integrations/anilist/cache';
import { expectShape } from '../../helpers/assert-spec';
import { SeriesSearchPostResponse } from '@/server/openapi/schemas/series';
import { ErrorResponse } from '@/server/openapi/schemas/common';

beforeEach(() => {
  vi.restoreAllMocks();
});

function req(body: unknown): Request {
  return new Request('http://localhost/api/series/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/series/search', () => {
  it('returns 200 with search hits', async () => {
    vi.spyOn(cache, 'searchMangaCached').mockResolvedValue([
      {
        anilistId: 1,
        titleEnglish: 'Foo',
        titleRomaji: null,
        titleNative: null,
        coverUrl: null,
        status: 'releasing',
        format: null,
        startYear: null,
      },
    ]);
    const res = await POST(req({ query: 'foo' }));
    expect(res.status).toBe(200);
    await expectShape(SeriesSearchPostResponse, res, 'POST /api/series/search');
    const json = await res.json();
    expect(json.hits).toHaveLength(1);
    expect(json.hits[0].anilistId).toBe(1);
  });

  it('returns 400 on empty query', async () => {
    const res = await POST(req({ query: '' }));
    expect(res.status).toBe(400);
    await expectShape(ErrorResponse, res, 'POST /api/series/search');
  });

  it('returns 400 on missing body', async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it('returns 502 if AniList client throws', async () => {
    vi.spyOn(cache, 'searchMangaCached').mockRejectedValue(new Error('AniList HTTP 500'));
    const res = await POST(req({ query: 'foo' }));
    expect(res.status).toBe(502);
    await expectShape(ErrorResponse, res, 'POST /api/series/search');
  });
});
