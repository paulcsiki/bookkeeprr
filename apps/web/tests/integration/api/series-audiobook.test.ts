import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { POST } from '@/app/api/series/route';
import { getSeries } from '@/server/db/series';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

function req(body: unknown): Request {
  return new Request('http://localhost/api/series', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/series — audiobook', () => {
  it('creates a series with totalVolumes=1, granularity=volume, asin, narrator', async () => {
    const res = await POST(
      req({
        contentType: 'audiobook',
        asin: 'B086WJP9HX',
        author: 'Andy Weir',
        narrator: 'Ray Porter',
        title: 'Project Hail Mary',
        year: 2021,
        coverUrl: 'https://m.media-amazon.com/images/I/91Bd7P8YyYL.jpg',
        description: 'A lone astronaut.',
        runtimeMinutes: 970,
        qualityProfileId: h.qpId,
        monitoring: 'all',
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id?: number } & Record<string, unknown>;
    const id = (body.id ?? (body as { id: number }).id) as number;
    const row = await getSeries(id);
    expect(row?.contentType).toBe('audiobook');
    expect(row?.asin).toBe('B086WJP9HX');
    expect(row?.narrator).toBe('Ray Porter');
    expect(row?.author).toBe('Andy Weir');
    expect(row?.titleEnglish).toBe('Project Hail Mary');
    expect(row?.totalVolumes).toBe(1);
    expect(row?.granularity).toBe('volume');
    expect(row?.rootPath).toContain('audiobooks/');
  });

  it('returns 409 on duplicate asin', async () => {
    const body = {
      contentType: 'audiobook',
      asin: 'B086WJP9HX',
      author: 'Andy Weir',
      narrator: 'Ray Porter',
      title: 'Project Hail Mary',
      qualityProfileId: h.qpId,
    };
    const first = await POST(req(body));
    expect(first.status).toBe(201);
    const second = await POST(req({ ...body, title: 'PHM (dup)' }));
    expect(second.status).toBe(409);
  });

  it('audiobook body accepts groupId and persists it', async () => {
    const { createGroup } = await import('@/server/db/library-groups');
    const g = await createGroup('Audio Shelf', null);
    const res = await POST(
      req({
        contentType: 'audiobook',
        asin: 'B0GROUPED1',
        title: 'Grouped Audiobook',
        qualityProfileId: h.qpId,
        groupId: g.id,
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.groupId).toBe(g.id);
    expect(body.groupPath).toBe('Audio Shelf');
    const row = await getSeries(body.id);
    expect(row?.groupId).toBe(g.id);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await POST(
      req({
        contentType: 'audiobook',
        qualityProfileId: h.qpId,
      }),
    );
    expect(res.status).toBe(400);
  });
});
