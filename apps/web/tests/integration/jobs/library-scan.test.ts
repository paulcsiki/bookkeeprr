import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedDb, type SeedHandle } from '../helpers/seed';
import * as al from '@/server/integrations/anilist/cache';
import { enqueueJob, getJob } from '@/server/db/jobs';
import { runOnce } from '@/server/jobs/runner';
import { libraryScanDescriptor } from '@/server/jobs/kinds/library-scan';
import { contentTypePathsSetting } from '@/server/db/settings/library';
import {
  listPendingByDirectoryPrefix,
  getScanMatchByPath,
  updateScanMatchByPath,
} from '@/server/db/scan-matches';

let h: SeedHandle;
let root: string;

beforeEach(async () => {
  h = await seedDb({ anilistId: 105778 });
  root = mkdtempSync(join(tmpdir(), 'bk-libscan-'));
  vi.restoreAllMocks();
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  h.cleanup();
});

function mockAniHit(anilistId: number, titleRomaji: string): void {
  vi.spyOn(al, 'searchMangaCached').mockResolvedValue([
    {
      anilistId,
      titleRomaji,
      titleEnglish: null,
      titleNative: null,
      coverUrl: 'https://example/c.jpg',
      status: 'releasing',
      format: 'MANGA',
      startYear: 2018,
    },
  ]);
}

async function scanResult(jobId: number): Promise<{ scanned: number; matched: number }> {
  const job = await getJob(jobId);
  return JSON.parse(job!.resultJson!) as { scanned: number; matched: number };
}

describe('library_scan', () => {
  it('writes a scan_matches row per archive with AniList match stashed', async () => {
    mkdirSync(join(root, 'Chainsaw Man'));
    writeFileSync(join(root, 'Chainsaw Man', 'Chainsaw Man - v01 [LH].cbz'), '');
    writeFileSync(join(root, 'Chainsaw Man', 'Chainsaw Man - v02 [LH].cbz'), '');
    mockAniHit(105778, 'Chainsaw Man');

    await enqueueJob('library_scan', { rootPath: root });
    const result = await runOnce(libraryScanDescriptor);
    expect(result).toBe('ran');

    const rows = await listPendingByDirectoryPrefix(join(root, 'Chainsaw Man'));
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      const debug = JSON.parse(r.parserDebugJson) as { aniListMatch: { anilistId: number } };
      expect(debug.aniListMatch?.anilistId).toBe(105778);
      expect(r.proposedSeriesId).toBe(h.seriesId);
      expect(r.proposedVolume).toBeGreaterThan(0);
      expect(r.confidence).toBeGreaterThan(0.9);
    }
  });

  it('persists scan-session params (scanRootPath/targetGroupId/structure) and refreshes them on rescan', async () => {
    const { createGroup } = await import('@/server/db/library-groups');
    const group = await createGroup('Backlog', null);
    mkdirSync(join(root, 'Sess'));
    const p1 = join(root, 'Sess', 'Sess v01.cbz');
    writeFileSync(p1, '');
    mockAniHit(1, 'Sess');

    await enqueueJob('library_scan', {
      rootPath: root,
      targetGroupId: group.id,
      structure: 'mirror',
    });
    await runOnce(libraryScanDescriptor);
    const r1 = (await getScanMatchByPath(p1))!;
    expect(r1.scanRootPath).toBe(root);
    expect(r1.targetGroupId).toBe(group.id);
    expect(r1.structure).toBe('mirror');

    // A rescan without params refreshes the session params on pending rows.
    await enqueueJob('library_scan', { rootPath: root });
    await runOnce(libraryScanDescriptor);
    const r2 = (await getScanMatchByPath(p1))!;
    expect(r2.id).toBe(r1.id);
    expect(r2.scanRootPath).toBe(root);
    expect(r2.targetGroupId).toBeNull();
    expect(r2.structure).toBeNull();
  });

  it('memoizes AniList lookups per directory (1 hit for N files)', async () => {
    mkdirSync(join(root, 'Solo'));
    writeFileSync(join(root, 'Solo', 'Solo v01.cbz'), '');
    writeFileSync(join(root, 'Solo', 'Solo v02.cbz'), '');
    writeFileSync(join(root, 'Solo', 'Solo v03.cbz'), '');
    const spy = vi.spyOn(al, 'searchMangaCached').mockResolvedValue([]);
    await enqueueJob('library_scan', { rootPath: root });
    await runOnce(libraryScanDescriptor);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('skips confirmed and rejected rows on rescan', async () => {
    mkdirSync(join(root, 'A'));
    const p1 = join(root, 'A', 'A v01.cbz');
    writeFileSync(p1, '');
    mockAniHit(1, 'A');

    await enqueueJob('library_scan', { rootPath: root });
    await runOnce(libraryScanDescriptor);
    const r1 = (await getScanMatchByPath(p1))!;
    await updateScanMatchByPath(p1, { status: 'confirmed', confidence: 0.5 });

    await enqueueJob('library_scan', { rootPath: root });
    await runOnce(libraryScanDescriptor);
    const r2 = (await getScanMatchByPath(p1))!;
    expect(r2.id).toBe(r1.id);
    expect(r2.status).toBe('confirmed');
    expect(r2.confidence).toBe(0.5);
  });

  it('updates pending rows in place with fresh parse on rescan', async () => {
    mkdirSync(join(root, 'A'));
    const p1 = join(root, 'A', 'A v01.cbz');
    writeFileSync(p1, '');
    mockAniHit(1, 'A');

    await enqueueJob('library_scan', { rootPath: root });
    await runOnce(libraryScanDescriptor);
    const id1 = (await getScanMatchByPath(p1))!.id;

    await enqueueJob('library_scan', { rootPath: root });
    await runOnce(libraryScanDescriptor);
    const r2 = (await getScanMatchByPath(p1))!;
    expect(r2.id).toBe(id1);
    expect(r2.status).toBe('pending');
  });

  it('sets proposedSeriesId=null when AniList returns no match', async () => {
    mkdirSync(join(root, 'Obscure'));
    writeFileSync(join(root, 'Obscure', 'Obscure v01.cbz'), '');
    vi.spyOn(al, 'searchMangaCached').mockResolvedValue([]);
    await enqueueJob('library_scan', { rootPath: root });
    await runOnce(libraryScanDescriptor);
    const row = await getScanMatchByPath(join(root, 'Obscure', 'Obscure v01.cbz'));
    expect(row?.proposedSeriesId).toBeNull();
    const debug = JSON.parse(row!.parserDebugJson) as { aniListMatch: unknown };
    expect(debug.aniListMatch).toBeNull();
  });

  it('continues the scan when AniList throws for a directory', async () => {
    mkdirSync(join(root, 'Bad'));
    mkdirSync(join(root, 'Good'));
    writeFileSync(join(root, 'Bad', 'Bad v01.cbz'), '');
    writeFileSync(join(root, 'Good', 'Good v01.cbz'), '');

    let calls = 0;
    vi.spyOn(al, 'searchMangaCached').mockImplementation(async () => {
      calls++;
      if (calls === 1) throw new Error('anilist 503');
      // Return the seeded series so proposedSeriesId gets resolved
      return [
        {
          anilistId: 105778,
          titleRomaji: 'Good',
          titleEnglish: null,
          titleNative: null,
          coverUrl: null,
          status: 'releasing',
          format: 'MANGA',
          startYear: 2020,
        },
      ];
    });

    await enqueueJob('library_scan', { rootPath: root });
    const result = await runOnce(libraryScanDescriptor);
    expect(result).toBe('ran');

    // Both directories should have produced scan_matches rows
    expect(calls).toBe(2);
    const rowBad = await getScanMatchByPath(join(root, 'Bad', 'Bad v01.cbz'));
    const rowGood = await getScanMatchByPath(join(root, 'Good', 'Good v01.cbz'));
    expect(rowBad).not.toBeNull();
    expect(rowGood).not.toBeNull();
    // The directory that threw has null proposedSeriesId; the successful one has a match
    const rows = [rowBad, rowGood];
    const nullMatches = rows.filter((r) => r?.proposedSeriesId === null);
    const goodMatches = rows.filter((r) => r?.proposedSeriesId !== null);
    expect(nullMatches).toHaveLength(1);
    expect(goodMatches).toHaveLength(1);
  });

  it('scans every per-type libraryRoot override (multi-root), aggregating scanned across roots', async () => {
    // Two distinct library roots via per-type overrides.
    const rootA = mkdtempSync(join(tmpdir(), 'bk-libscan-a-'));
    const rootB = mkdtempSync(join(tmpdir(), 'bk-libscan-b-'));
    try {
      mkdirSync(join(rootA, 'Manga Title'));
      writeFileSync(join(rootA, 'Manga Title', 'Manga Title v01.cbz'), '');
      mkdirSync(join(rootB, 'Book Title'));
      writeFileSync(join(rootB, 'Book Title', 'Book Title v01.cbz'), '');

      const paths = await contentTypePathsSetting.get();
      await contentTypePathsSetting.set({
        ...paths,
        manga: { ...paths.manga, libraryRoot: rootA },
        ebook: { ...paths.ebook, libraryRoot: rootB },
      });
      // Point the remaining fallback roots at an unreadable place so they yield nothing.
      process.env.BOOKKEEPRR_MEDIA_ROOT = join(tmpdir(), 'bk-libscan-missing-fallback');

      const spy = vi.spyOn(al, 'searchMangaCached').mockResolvedValue([]);
      // Payload rootPath is the legacy single-root; multi-root still adds the overrides.
      const jobId = await enqueueJob('library_scan', { rootPath: root });
      expect(await runOnce(libraryScanDescriptor)).toBe('ran');
      // One archive in rootA + one in rootB.
      expect((await scanResult(jobId)).scanned).toBe(2);
      expect(spy).toHaveBeenCalledTimes(2);

      const rowA = await getScanMatchByPath(join(rootA, 'Manga Title', 'Manga Title v01.cbz'));
      const rowB = await getScanMatchByPath(join(rootB, 'Book Title', 'Book Title v01.cbz'));
      expect(rowA).not.toBeNull();
      expect(rowB).not.toBeNull();
    } finally {
      delete process.env.BOOKKEEPRR_MEDIA_ROOT;
      rmSync(rootA, { recursive: true, force: true });
      rmSync(rootB, { recursive: true, force: true });
    }
  });

  it('default (no overrides) scans the single mediaRoot once without double-counting fallbacks', async () => {
    // No per-type overrides → every type falls back to mediaRoot/<subdir>;
    // dedupe collapses manga+comic→comics etc. We point mediaRoot at `root`'s
    // parent so the deduped fallback subdirs live under our temp tree.
    const media = mkdtempSync(join(tmpdir(), 'bk-libscan-media-'));
    try {
      // Single scannable archive under the comics subdir.
      mkdirSync(join(media, 'comics', 'Solo'), { recursive: true });
      writeFileSync(join(media, 'comics', 'Solo', 'Solo v01.cbz'), '');
      process.env.BOOKKEEPRR_MEDIA_ROOT = media;

      vi.spyOn(al, 'searchMangaCached').mockResolvedValue([]);
      // Legacy payload points at the same comics dir; union+dedupe must not double-count.
      const jobId = await enqueueJob('library_scan', { rootPath: join(media, 'comics') });
      expect(await runOnce(libraryScanDescriptor)).toBe('ran');
      expect((await scanResult(jobId)).scanned).toBe(1);
    } finally {
      delete process.env.BOOKKEEPRR_MEDIA_ROOT;
      rmSync(media, { recursive: true, force: true });
    }
  });

  it('does not double-walk a child fallback root nested under the payload parent', async () => {
    // The real-world default: a scheduled scan passes the PARENT media root,
    // while getAllLibraryRoots() returns its children (comics/books/audiobooks).
    // walk() recurses, so without the nested-root filter the comics file would be
    // scanned twice (by /media and by /media/comics).
    const media = mkdtempSync(join(tmpdir(), 'bk-libscan-parent-'));
    try {
      mkdirSync(join(media, 'comics', 'Solo'), { recursive: true });
      writeFileSync(join(media, 'comics', 'Solo', 'Solo v01.cbz'), '');
      process.env.BOOKKEEPRR_MEDIA_ROOT = media;

      vi.spyOn(al, 'searchMangaCached').mockResolvedValue([]);
      // Payload is the PARENT; fallback roots (media/comics, …) are nested under it.
      const jobId = await enqueueJob('library_scan', { rootPath: media });
      expect(await runOnce(libraryScanDescriptor)).toBe('ran');
      expect((await scanResult(jobId)).scanned).toBe(1);
    } finally {
      delete process.env.BOOKKEEPRR_MEDIA_ROOT;
      rmSync(media, { recursive: true, force: true });
    }
  });

  it('a configured-but-missing root does not abort the scan', async () => {
    const rootGood = mkdtempSync(join(tmpdir(), 'bk-libscan-good-'));
    const missing = join(tmpdir(), 'bk-libscan-does-not-exist-' + Date.now());
    try {
      mkdirSync(join(rootGood, 'Present'));
      writeFileSync(join(rootGood, 'Present', 'Present v01.cbz'), '');

      const paths = await contentTypePathsSetting.get();
      await contentTypePathsSetting.set({
        ...paths,
        manga: { ...paths.manga, libraryRoot: missing },
        ebook: { ...paths.ebook, libraryRoot: rootGood },
      });
      process.env.BOOKKEEPRR_MEDIA_ROOT = join(tmpdir(), 'bk-libscan-missing-fallback2');

      vi.spyOn(al, 'searchMangaCached').mockResolvedValue([]);
      const jobId = await enqueueJob('library_scan', { rootPath: rootGood });
      expect(await runOnce(libraryScanDescriptor)).toBe('ran');
      // The present root still got scanned despite the missing one.
      expect((await scanResult(jobId)).scanned).toBe(1);
      const row = await getScanMatchByPath(join(rootGood, 'Present', 'Present v01.cbz'));
      expect(row).not.toBeNull();
    } finally {
      delete process.env.BOOKKEEPRR_MEDIA_ROOT;
      rmSync(rootGood, { recursive: true, force: true });
    }
  });

  it('cache key uses full path, not basename — sibling subtrees with same dirname are looked up separately', async () => {
    mkdirSync(join(root, 'Publisher A', 'Berserk'), { recursive: true });
    mkdirSync(join(root, 'Publisher B', 'Berserk'), { recursive: true });
    writeFileSync(join(root, 'Publisher A', 'Berserk', 'v01.cbz'), '');
    writeFileSync(join(root, 'Publisher B', 'Berserk', 'v01.cbz'), '');
    const spy = vi.spyOn(al, 'searchMangaCached').mockResolvedValue([]);
    await enqueueJob('library_scan', { rootPath: root });
    await runOnce(libraryScanDescriptor);
    // Two distinct directories — even with same basename, both should query AniList
    // (the per-job memo is keyed on full path, not basename).
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
