import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { insertSeries, getSeries } from '@/server/db/series';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

describe('insertSeries — audiobook fields', () => {
  it('round-trips asin and narrator', async () => {
    const id = await insertSeries({
      contentType: 'audiobook',
      asin: 'B086WJP9HX',
      author: 'Andy Weir',
      narrator: 'Ray Porter',
      titleEnglish: 'Project Hail Mary',
      status: 'finished',
      rootPath: '/media/audiobooks/Andy Weir/Project Hail Mary',
      qualityProfileId: h.qpId,
      totalVolumes: 1,
      granularity: 'volume',
    });
    const row = await getSeries(id);
    expect(row?.asin).toBe('B086WJP9HX');
    expect(row?.narrator).toBe('Ray Porter');
    expect(row?.author).toBe('Andy Weir');
    expect(row?.contentType).toBe('audiobook');
  });

  it('enforces UNIQUE(asin)', async () => {
    await insertSeries({
      contentType: 'audiobook',
      asin: 'B086WJP9HX',
      author: 'Andy Weir',
      narrator: 'Ray Porter',
      titleEnglish: 'Project Hail Mary',
      status: 'finished',
      rootPath: '/media/audiobooks/Andy Weir/Project Hail Mary',
      qualityProfileId: h.qpId,
      totalVolumes: 1,
      granularity: 'volume',
    });
    await expect(
      insertSeries({
        contentType: 'audiobook',
        asin: 'B086WJP9HX',
        author: 'Andy Weir',
        narrator: 'Ray Porter',
        titleEnglish: 'Project Hail Mary (dup)',
        status: 'finished',
        rootPath: '/media/audiobooks/Andy Weir/Project Hail Mary (dup)',
        qualityProfileId: h.qpId,
        totalVolumes: 1,
        granularity: 'volume',
      }),
    ).rejects.toThrow(/UNIQUE/);
  });

  it('allows multiple rows with NULL asin (non-audiobook)', async () => {
    const id1 = await insertSeries({
      contentType: 'manga',
      titleEnglish: 'A',
      status: 'releasing',
      rootPath: '/media/comics/A',
      qualityProfileId: h.qpId,
    });
    const id2 = await insertSeries({
      contentType: 'manga',
      titleEnglish: 'B',
      status: 'releasing',
      rootPath: '/media/comics/B',
      qualityProfileId: h.qpId,
    });
    expect(id1).not.toBe(id2);
  });
});
