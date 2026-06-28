import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertScanMatch } from '@/server/db/scan-matches';
import { GET } from '@/app/api/scan/groups/route';
import { dirHash } from '@/lib/dir-hash';
import { expectShape } from '../../helpers/assert-spec';
import { ScanGroupsResponse } from '@/server/openapi/schemas/scan';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ anilistId: 105778 });
});
afterEach(() => h.cleanup());

const aniMatch = {
  anilistId: 105778,
  titleRomaji: 'Chainsaw Man',
  titleEnglish: 'Chainsaw Man',
  titleNative: null,
  coverUrl: 'https://example/c.jpg',
  status: 'releasing',
  format: 'MANGA',
  startYear: 2018,
};

describe('GET /api/scan/groups', () => {
  it('returns one entry per directory with aggregated counts', async () => {
    const dir = '/media/comics/Chainsaw Man';
    await insertScanMatch({
      filePath: dir + '/v01.cbz',
      proposedSeriesId: h.seriesId,
      proposedVolume: 1,
      confidence: 0.9,
      parserDebugJson: JSON.stringify({ aniListMatch: aniMatch }),
    });
    await insertScanMatch({
      filePath: dir + '/v02.cbz',
      proposedSeriesId: h.seriesId,
      proposedVolume: 2,
      confidence: 0.95,
      parserDebugJson: JSON.stringify({ aniListMatch: aniMatch }),
    });
    const res = await GET();
    expect(res.status).toBe(200);
    await expectShape(ScanGroupsResponse, res, 'GET /api/scan/groups');
    const { groups } = (await res.json()) as {
      groups: Array<{
        dirHash: string;
        directory: string;
        fileCount: number;
        proposedAniListId: number | null;
        existingSeriesId: number | null;
        avgConfidence: number;
        inferredGranularity: string;
        files: unknown[];
      }>;
    };
    expect(groups).toHaveLength(1);
    const g = groups[0]!;
    expect(g.dirHash).toBe(dirHash(dir));
    expect(g.directory).toBe(dir);
    expect(g.fileCount).toBe(2);
    expect(g.proposedAniListId).toBe(105778);
    expect(g.existingSeriesId).toBe(h.seriesId);
    expect(g.avgConfidence).toBeCloseTo(0.925, 2);
    expect(g.inferredGranularity).toBe('volume');
    expect(g.files).toHaveLength(2);
  });

  it('inferredGranularity is "chapter" when group has any chapter rows', async () => {
    const dir = '/media/comics/Mixed';
    await insertScanMatch({
      filePath: dir + '/Mixed v01.cbz',
      proposedSeriesId: null,
      proposedVolume: 1,
      parserDebugJson: JSON.stringify({ aniListMatch: aniMatch }),
    });
    await insertScanMatch({
      filePath: dir + '/Mixed c14.cbz',
      proposedSeriesId: null,
      proposedChapter: '14',
      parserDebugJson: JSON.stringify({ aniListMatch: aniMatch }),
    });
    const res = await GET();
    const { groups } = (await res.json()) as { groups: Array<{ inferredGranularity: string }> };
    expect(groups[0]!.inferredGranularity).toBe('chapter');
  });

  it('exposes relativeDir and structure (scan-session params)', async () => {
    const dir = '/media/backlog/Shonen/Vinland Saga';
    await insertScanMatch({
      filePath: dir + '/v01.cbz',
      proposedSeriesId: null,
      proposedVolume: 1,
      parserDebugJson: JSON.stringify({ aniListMatch: aniMatch }),
      scanRootPath: '/media/backlog',
      targetGroupId: null,
      structure: 'mirror',
    });
    const res = await GET();
    await expectShape(ScanGroupsResponse, res, 'GET /api/scan/groups');
    const { groups } = (await res.json()) as {
      groups: Array<{ relativeDir: string; structure: string | null }>;
    };
    expect(groups[0]!.relativeDir).toBe('Shonen/Vinland Saga');
    expect(groups[0]!.structure).toBe('mirror');
  });

  it('structure is null for legacy rows (no session params)', async () => {
    await insertScanMatch({
      filePath: '/media/comics/Legacy/v01.cbz',
      proposedSeriesId: null,
      proposedVolume: 1,
      parserDebugJson: JSON.stringify({ aniListMatch: aniMatch }),
    });
    const res = await GET();
    await expectShape(ScanGroupsResponse, res, 'GET /api/scan/groups');
    const { groups } = (await res.json()) as { groups: Array<{ structure: string | null }> };
    expect(groups[0]!.structure).toBeNull();
  });

  it("relativeDir is '' for legacy rows (no session params) and for dirs at the root", async () => {
    await insertScanMatch({
      filePath: '/media/comics/Legacy/v01.cbz',
      proposedSeriesId: null,
      proposedVolume: 1,
      parserDebugJson: JSON.stringify({ aniListMatch: aniMatch }),
    });
    await insertScanMatch({
      filePath: '/media/backlog/v01.cbz',
      proposedSeriesId: null,
      proposedVolume: 1,
      parserDebugJson: JSON.stringify({ aniListMatch: aniMatch }),
      scanRootPath: '/media/backlog',
      targetGroupId: null,
      structure: 'mirror',
    });
    const res = await GET();
    const { groups } = (await res.json()) as {
      groups: Array<{ directory: string; relativeDir: string }>;
    };
    for (const g of groups) expect(g.relativeDir).toBe('');
  });

  it('returns empty array when no pending rows', async () => {
    const res = await GET();
    await expectShape(ScanGroupsResponse, res, 'GET /api/scan/groups');
    const { groups } = (await res.json()) as { groups: unknown[] };
    expect(groups).toEqual([]);
  });
});
