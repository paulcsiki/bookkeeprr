import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertScanMatch, getScanMatchByPath } from '@/server/db/scan-matches';
import { getLibraryFileByPath, listLibraryFilesBySeries } from '@/server/db/library-files';
import { listJobsByKind } from '@/server/db/jobs';
import { getSeries, getSeriesByAniListId } from '@/server/db/series';
import { createGroup, listGroups } from '@/server/db/library-groups';
import { POST } from '@/app/api/scan/groups/[dirHash]/confirm/route';
import { dirHash } from '@/lib/dir-hash';
import { expectShape } from '../../helpers/assert-spec';
import { ErrorResponse } from '@/server/openapi/schemas/common';
import { ScanGroupConfirmResponse } from '@/server/openapi/schemas/scan';

let h: SeedHandle;
let tmp: string;

beforeEach(async () => {
  h = await seedDb({ anilistId: 1 });
  tmp = mkdtempSync(join(tmpdir(), 'bk-confirm-'));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  h.cleanup();
});

function aniMatch(anilistId: number, titleRomaji: string): unknown {
  return {
    anilistId,
    titleRomaji,
    titleEnglish: null,
    titleNative: null,
    coverUrl: 'https://example/c.jpg',
    status: 'releasing',
    format: 'MANGA',
    startYear: 2020,
  };
}

function req(): Request {
  return new Request('http://x/confirm', { method: 'POST' });
}

async function realFile(dir: string, name: string): Promise<string> {
  const p = join(dir, name);
  writeFileSync(p, 'x');
  return p;
}

describe('POST /api/scan/groups/[dirHash]/confirm', () => {
  it('creates new series + inserts library_files + enqueues hydrate+chapter jobs', async () => {
    const f1 = await realFile(tmp, 'New v01.cbz');
    const f2 = await realFile(tmp, 'New v02.cbz');
    await insertScanMatch({
      filePath: f1,
      proposedSeriesId: null,
      proposedVolume: 1,
      confidence: 0.9,
      parserDebugJson: JSON.stringify({ aniListMatch: aniMatch(777, 'New Series') }),
    });
    await insertScanMatch({
      filePath: f2,
      proposedSeriesId: null,
      proposedVolume: 2,
      confidence: 0.9,
      parserDebugJson: JSON.stringify({ aniListMatch: aniMatch(777, 'New Series') }),
    });

    const res = await POST(req(), { params: Promise.resolve({ dirHash: dirHash(tmp) }) });
    expect(res.status).toBe(200);
    await expectShape(ScanGroupConfirmResponse, res, 'POST /api/scan/groups/{dirHash}/confirm');
    const body = (await res.json()) as {
      seriesId: number;
      importedCount: number;
      skippedCount: number;
    };
    expect(body.importedCount).toBe(2);
    expect(body.skippedCount).toBe(0);

    const created = await getSeriesByAniListId(777);
    expect(created?.id).toBe(body.seriesId);
    expect(created?.monitoring).toBe('none');
    expect(created?.rootPath).toBe(tmp);

    const files = await listLibraryFilesBySeries(body.seriesId);
    expect(files).toHaveLength(2);
    for (const f of files) expect(f.sourceReleaseId).toBeNull();

    const r1 = await getScanMatchByPath(f1);
    expect(r1?.status).toBe('confirmed');
    expect(r1?.reviewedAt).toBeTruthy();

    const hydrateJobs = await listJobsByKind('metadata_hydrate');
    const chapterJobs = await listJobsByKind('mangadex_chapter_sync');
    expect(hydrateJobs.some((j) => (j.payloadJson ?? '').includes(String(body.seriesId)))).toBe(
      true,
    );
    expect(chapterJobs.some((j) => (j.payloadJson ?? '').includes(String(body.seriesId)))).toBe(
      true,
    );
  });

  it('links to existing series; no new series row, no follow-up jobs', async () => {
    const f1 = await realFile(tmp, 'Existing v01.cbz');
    await insertScanMatch({
      filePath: f1,
      proposedSeriesId: h.seriesId,
      proposedVolume: 1,
      confidence: 0.9,
      parserDebugJson: JSON.stringify({ aniListMatch: aniMatch(1, 'Existing') }),
    });
    const beforeHydrate = (await listJobsByKind('metadata_hydrate')).length;
    const beforeChapter = (await listJobsByKind('mangadex_chapter_sync')).length;

    const res = await POST(req(), { params: Promise.resolve({ dirHash: dirHash(tmp) }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { seriesId: number; importedCount: number };
    expect(body.seriesId).toBe(h.seriesId);
    expect(body.importedCount).toBe(1);

    const series = await getSeries(h.seriesId);
    expect(series).toBeTruthy();
    expect((await listJobsByKind('metadata_hydrate')).length).toBe(beforeHydrate);
    expect((await listJobsByKind('mangadex_chapter_sync')).length).toBe(beforeChapter);
  });

  it('resolves volume_id when a matching volume row exists', async () => {
    const f1 = await realFile(tmp, 'Existing v01.cbz');
    await insertScanMatch({
      filePath: f1,
      proposedSeriesId: h.seriesId,
      proposedVolume: 1,
      confidence: 0.9,
      parserDebugJson: JSON.stringify({ aniListMatch: aniMatch(1, 'Existing') }),
    });
    const res = await POST(req(), { params: Promise.resolve({ dirHash: dirHash(tmp) }) });
    expect(res.status).toBe(200);
    const lf = await getLibraryFileByPath(f1);
    expect(lf?.volumeId).toBe(h.volumeId);
  });

  it('chapter range → chapter_id null, file links to series only', async () => {
    const f1 = await realFile(tmp, 'Existing c001-012.cbz');
    await insertScanMatch({
      filePath: f1,
      proposedSeriesId: h.seriesId,
      proposedChapter: '001-012',
      confidence: 0.85,
      parserDebugJson: JSON.stringify({ aniListMatch: aniMatch(1, 'Existing') }),
    });
    const res = await POST(req(), { params: Promise.resolve({ dirHash: dirHash(tmp) }) });
    expect(res.status).toBe(200);
    const lf = await getLibraryFileByPath(f1);
    expect(lf?.chapterId).toBeNull();
    expect(lf?.seriesId).toBe(h.seriesId);
  });

  it('volume file with no matching volume row → volume_id null', async () => {
    const f1 = await realFile(tmp, 'Existing v999.cbz');
    await insertScanMatch({
      filePath: f1,
      proposedSeriesId: h.seriesId,
      proposedVolume: 999,
      confidence: 0.9,
      parserDebugJson: JSON.stringify({ aniListMatch: aniMatch(1, 'Existing') }),
    });
    const res = await POST(req(), { params: Promise.resolve({ dirHash: dirHash(tmp) }) });
    expect(res.status).toBe(200);
    const lf = await getLibraryFileByPath(f1);
    expect(lf?.volumeId).toBeNull();
  });

  it('skips duplicate library_files.path and counts it in skippedCount', async () => {
    const f1 = await realFile(tmp, 'Dup v01.cbz');
    const { insertLibraryFile } = await import('@/server/db/library-files');
    await insertLibraryFile({ seriesId: h.seriesId, path: f1, sizeBytes: 1 });
    await insertScanMatch({
      filePath: f1,
      proposedSeriesId: h.seriesId,
      proposedVolume: 1,
      confidence: 0.9,
      parserDebugJson: JSON.stringify({ aniListMatch: aniMatch(1, 'Existing') }),
    });
    const res = await POST(req(), { params: Promise.resolve({ dirHash: dirHash(tmp) }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { importedCount: number; skippedCount: number };
    expect(body.importedCount).toBe(0);
    expect(body.skippedCount).toBe(1);
  });

  it('400 when group has no proposed_series_id and no aniListMatch.anilistId', async () => {
    const f1 = await realFile(tmp, 'Orphan v01.cbz');
    await insertScanMatch({
      filePath: f1,
      proposedSeriesId: null,
      proposedVolume: 1,
      parserDebugJson: JSON.stringify({}),
    });
    const res = await POST(req(), { params: Promise.resolve({ dirHash: dirHash(tmp) }) });
    expect(res.status).toBe(400);
    await expectShape(ErrorResponse, res, 'POST /api/scan/groups/{dirHash}/confirm');
  });

  it('404 when group has zero pending rows', async () => {
    const res = await POST(req(), { params: Promise.resolve({ dirHash: 'cafecafecafe' }) });
    expect(res.status).toBe(404);
    await expectShape(ErrorResponse, res, 'POST /api/scan/groups/{dirHash}/confirm');
  });

  describe('library-group assignment (scan session params)', () => {
    async function seedMatch(
      filePath: string,
      anilistId: number,
      session: {
        scanRootPath: string;
        targetGroupId: number | null;
        structure: 'flat' | 'mirror';
      },
      proposedSeriesId: number | null = null,
    ): Promise<void> {
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, 'x');
      await insertScanMatch({
        filePath,
        proposedSeriesId,
        proposedVolume: 1,
        confidence: 0.9,
        parserDebugJson: JSON.stringify({ aniListMatch: aniMatch(anilistId, `Series ${anilistId}`) }),
        ...session,
      });
    }

    async function confirm(dir: string): Promise<{ seriesId: number }> {
      const res = await POST(req(), { params: Promise.resolve({ dirHash: dirHash(dir) }) });
      expect(res.status).toBe(200);
      return (await res.json()) as { seriesId: number };
    }

    it('flat: new series lands in the target group', async () => {
      const target = await createGroup('Backlog', null);
      const dir = join(tmp, 'Flat Series');
      await seedMatch(join(dir, 'v01.cbz'), 801, {
        scanRootPath: tmp,
        targetGroupId: target.id,
        structure: 'flat',
      });
      const { seriesId } = await confirm(dir);
      expect((await getSeries(seriesId))?.groupId).toBe(target.id);
      // flat never materializes folders as groups
      expect((await listGroups()).map((g) => g.name)).toEqual(['Backlog']);
    });

    it('mirror, single level, NULL target: folder becomes a root group', async () => {
      const dir = join(tmp, 'Shonen', 'Vinland Saga');
      await seedMatch(join(dir, 'v01.cbz'), 802, {
        scanRootPath: tmp,
        targetGroupId: null,
        structure: 'mirror',
      });
      const { seriesId } = await confirm(dir);
      const shonen = (await listGroups()).find((g) => g.name === 'Shonen');
      expect(shonen).toBeTruthy();
      expect(shonen!.parentId).toBeNull();
      expect((await getSeries(seriesId))?.groupId).toBe(shonen!.id);
    });

    it('mirror, nested: materializes the full chain under the target', async () => {
      const target = await createGroup('Imports', null);
      const dir = join(tmp, 'Shonen', 'Battle', 'X Series');
      await seedMatch(join(dir, 'v01.cbz'), 803, {
        scanRootPath: tmp,
        targetGroupId: target.id,
        structure: 'mirror',
      });
      const { seriesId } = await confirm(dir);
      const groups = await listGroups();
      const shonen = groups.find((g) => g.name === 'Shonen');
      const battle = groups.find((g) => g.name === 'Battle');
      expect(shonen?.parentId).toBe(target.id);
      expect(battle?.parentId).toBe(shonen?.id);
      expect((await getSeries(seriesId))?.groupId).toBe(battle?.id);
      // The series folder itself ('X Series') is the series, never a group.
      expect(groups.some((g) => g.name === 'X Series')).toBe(false);
    });

    it('mirror: series folder directly at the scan root lands in the target itself', async () => {
      const target = await createGroup('Imports', null);
      const dir = join(tmp, 'Root Series');
      await seedMatch(join(dir, 'v01.cbz'), 804, {
        scanRootPath: tmp,
        targetGroupId: target.id,
        structure: 'mirror',
      });
      const { seriesId } = await confirm(dir);
      expect((await getSeries(seriesId))?.groupId).toBe(target.id);
      expect((await listGroups()).map((g) => g.name)).toEqual(['Imports']);
    });

    it('mirror: two confirms in the same tree reuse the same group (idempotent)', async () => {
      const dirA = join(tmp, 'Shonen', 'Series A');
      const dirB = join(tmp, 'Shonen', 'Series B');
      const session = { scanRootPath: tmp, targetGroupId: null, structure: 'mirror' as const };
      await seedMatch(join(dirA, 'v01.cbz'), 805, session);
      await seedMatch(join(dirB, 'v01.cbz'), 806, session);
      const a = await confirm(dirA);
      const b = await confirm(dirB);
      const shonenGroups = (await listGroups()).filter((g) => g.name === 'Shonen');
      expect(shonenGroups).toHaveLength(1);
      expect((await getSeries(a.seriesId))?.groupId).toBe(shonenGroups[0]!.id);
      expect((await getSeries(b.seriesId))?.groupId).toBe(shonenGroups[0]!.id);
    });

    it('pre-existing matched series keeps its group — no move, no groups created', async () => {
      const target = await createGroup('Imports', null);
      const dir = join(tmp, 'Shonen', 'Existing');
      await seedMatch(
        join(dir, 'v01.cbz'),
        1,
        { scanRootPath: tmp, targetGroupId: target.id, structure: 'mirror' },
        h.seriesId,
      );
      const before = (await getSeries(h.seriesId))?.groupId ?? null;
      const { seriesId } = await confirm(dir);
      expect(seriesId).toBe(h.seriesId);
      expect((await getSeries(h.seriesId))?.groupId ?? null).toBe(before);
      // Mirror materialization is skipped entirely for existing series.
      expect((await listGroups()).map((g) => g.name)).toEqual(['Imports']);
    });

    it('legacy rows (no session params) keep today’s behavior: no group', async () => {
      const f1 = await realFile(tmp, 'Legacy v01.cbz');
      await insertScanMatch({
        filePath: f1,
        proposedSeriesId: null,
        proposedVolume: 1,
        confidence: 0.9,
        parserDebugJson: JSON.stringify({ aniListMatch: aniMatch(807, 'Legacy') }),
      });
      const { seriesId } = await confirm(tmp);
      expect((await getSeries(seriesId))?.groupId).toBeNull();
      expect(await listGroups()).toEqual([]);
    });
  });

  it('does not enqueue hydrate/chapter jobs when all files are UNIQUE-skipped', async () => {
    const f1 = await realFile(tmp, 'AllDup v01.cbz');
    // Pre-populate library_files with a row that will collide on path
    const { insertLibraryFile } = await import('@/server/db/library-files');
    await insertLibraryFile({ seriesId: h.seriesId, path: f1, sizeBytes: 1 });

    // Now stage a scan_match that proposes a NEW series (anilistId 12345 not in DB)
    await insertScanMatch({
      filePath: f1,
      proposedSeriesId: null,
      proposedVolume: 1,
      confidence: 0.9,
      parserDebugJson: JSON.stringify({ aniListMatch: aniMatch(12345, 'Orphan Candidate') }),
    });
    const beforeHydrate = (await listJobsByKind('metadata_hydrate')).length;
    const beforeChapter = (await listJobsByKind('mangadex_chapter_sync')).length;

    const res = await POST(req(), { params: Promise.resolve({ dirHash: dirHash(tmp) }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { importedCount: number; skippedCount: number };
    expect(body.importedCount).toBe(0);
    expect(body.skippedCount).toBe(1);

    // No new jobs enqueued for the orphan series
    expect((await listJobsByKind('metadata_hydrate')).length).toBe(beforeHydrate);
    expect((await listJobsByKind('mangadex_chapter_sync')).length).toBe(beforeChapter);
  });
});
