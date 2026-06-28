import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { POST } from '@/app/api/series/route';
import { getSeries } from '@/server/db/series';
import { getDb } from '@/server/db/client';
import { jobs, volumes } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import * as nu from '@/server/integrations/novelupdates';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => {
  vi.restoreAllMocks();
  h.cleanup();
});

function req(body: unknown): Request {
  return new Request('http://localhost/api/series', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/series with LightNovelBody.novelUpdatesSlug', () => {
  it('persists slug + enqueues novel_updates_hydrate', async () => {
    const res = await POST(
      req({
        contentType: 'light_novel',
        anilistId: 9999,
        titleEnglish: 'Mushoku Tensei',
        qualityProfileId: h.qpId,
        rootPath: '/media/books/Mushoku Tensei Light Novel',
        novelUpdatesSlug: 'mushoku-tensei',
      }),
    );
    expect([200, 201]).toContain(res.status);
    const body = (await res.json()) as { id: number };

    const series = await getSeries(body.id);
    expect(series!.novelUpdatesSlug).toBe('mushoku-tensei');

    const queued = await getDb().select().from(jobs).where(eq(jobs.kind, 'novel_updates_hydrate'));
    expect(queued.length).toBeGreaterThanOrEqual(1);
  });

  it('omits slug + skips enqueue when not provided', async () => {
    const res = await POST(
      req({
        contentType: 'light_novel',
        anilistId: 9999,
        titleEnglish: 'X',
        qualityProfileId: h.qpId,
        rootPath: '/media/books/X Light Novel',
      }),
    );
    expect([200, 201]).toContain(res.status);
    const body = (await res.json()) as { id: number };
    const series = await getSeries(body.id);
    expect(series!.novelUpdatesSlug).toBeNull();

    const queued = await getDb().select().from(jobs).where(eq(jobs.kind, 'novel_updates_hydrate'));
    expect(queued.length).toBe(0);
  });

  it('creates an NU-only novel (no anilistId): hydrates from getSeriesBySlug, seeds no volumes', async () => {
    vi.spyOn(nu, 'getSeriesBySlug').mockResolvedValue({
      slug: 'solo-leveling',
      numericId: 12345,
      title: 'Solo Leveling',
      aliases: ['Na Honjaman Level Up'],
      coverUrl: 'https://nu/cover.jpg',
      description: 'Weakest hunter becomes strongest.',
      author: 'Chugong',
      illustrator: null,
      originalLanguage: 'Korean',
      totalVolumes: null,
      statusInCoo: 'Completed',
    });
    const res = await POST(
      req({
        contentType: 'light_novel',
        titleEnglish: 'Solo Leveling',
        qualityProfileId: h.qpId,
        rootPath: '/media/books/Solo Leveling Light Novel',
        novelUpdatesSlug: 'solo-leveling',
      }),
    );
    expect([200, 201]).toContain(res.status);
    const body = (await res.json()) as { id: number };
    const series = await getSeries(body.id);
    expect(series!.anilistId).toBeNull();
    expect(series!.novelUpdatesSlug).toBe('solo-leveling');
    expect(series!.granularity).toBe('volume');
    expect(series!.coverUrl).toBe('https://nu/cover.jpg');
    expect(series!.description).toBe('Weakest hunter becomes strongest.');

    const vols = await getDb().select().from(volumes).where(eq(volumes.seriesId, body.id));
    expect(vols).toHaveLength(0);

    const queued = await getDb().select().from(jobs).where(eq(jobs.kind, 'novel_updates_hydrate'));
    expect(queued.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects when neither anilistId nor novelUpdatesSlug is present', async () => {
    const res = await POST(
      req({
        contentType: 'light_novel',
        titleEnglish: 'No Ids',
        qualityProfileId: h.qpId,
        rootPath: '/media/books/No Ids Light Novel',
      }),
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('NU scrape failure on create is non-fatal — series still created with typed title', async () => {
    vi.spyOn(nu, 'getSeriesBySlug').mockRejectedValue(
      new nu.NovelUpdatesError('blocked', '403'),
    );
    const res = await POST(
      req({
        contentType: 'light_novel',
        titleEnglish: 'Typed Title',
        qualityProfileId: h.qpId,
        rootPath: '/media/books/Typed Title Light Novel',
        novelUpdatesSlug: 'solo-leveling',
      }),
    );
    expect([200, 201]).toContain(res.status);
    const body = (await res.json()) as { id: number };
    const series = await getSeries(body.id);
    expect(series!.titleEnglish).toBe('Typed Title');
    expect(series!.novelUpdatesSlug).toBe('solo-leveling');
  });

  it('returns 4xx on malformed slug', async () => {
    const res = await POST(
      req({
        contentType: 'light_novel',
        anilistId: 9999,
        titleEnglish: 'X',
        qualityProfileId: h.qpId,
        rootPath: '/media/books/X Light Novel',
        novelUpdatesSlug: 'Has Spaces',
      }),
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});
