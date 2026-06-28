import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { closeDb, getDb } from '@/server/db/client';
import { enqueueJob, claimNextJob, recordJobResult, activeJobKindsForSeries } from '@/server/db/jobs';

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'bk-akfs-'));
  process.env.BOOKKEEPRR_DB_PATH = join(tmp, 'test.db');
  migrate(getDb(), { migrationsFolder: './drizzle' });
});
afterEach(() => {
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

describe('activeJobKindsForSeries', () => {
  it('returns [] when there are no jobs', async () => {
    expect(await activeJobKindsForSeries(1)).toEqual([]);
  });

  it('returns the kind of a pending hydrate job for the series', async () => {
    await enqueueJob('metadata_hydrate', { seriesId: 7 });
    expect(await activeJobKindsForSeries(7)).toEqual(['metadata_hydrate']);
  });

  it('includes a running job for the series', async () => {
    await enqueueJob('mangadex_volume_hydrate', { seriesId: 9 });
    await claimNextJob('mangadex_volume_hydrate'); // -> running
    expect(await activeJobKindsForSeries(9)).toEqual(['mangadex_volume_hydrate']);
  });

  it('returns distinct kinds across the series-activity kinds', async () => {
    await enqueueJob('novel_updates_hydrate', { seriesId: 5 });
    await enqueueJob('novel_updates_chapter_sync', { seriesId: 5 });
    await enqueueJob('novel_updates_chapter_sync', { seriesId: 5 }); // dup kind
    const kinds = await activeJobKindsForSeries(5);
    expect(kinds.sort()).toEqual(['novel_updates_chapter_sync', 'novel_updates_hydrate']);
  });

  it('excludes jobs belonging to a different series', async () => {
    await enqueueJob('metadata_hydrate', { seriesId: 100 });
    expect(await activeJobKindsForSeries(200)).toEqual([]);
  });

  it('excludes completed jobs', async () => {
    await enqueueJob('metadata_hydrate', { seriesId: 3 });
    const claimed = await claimNextJob('metadata_hydrate');
    await recordJobResult(claimed!.id, { volumesAdded: 0 });
    expect(await activeJobKindsForSeries(3)).toEqual([]);
  });

  it('excludes unrelated kinds even when they reference the series', async () => {
    await enqueueJob('library_scan', { seriesId: 5 });
    expect(await activeJobKindsForSeries(5)).toEqual([]);
  });

  it('reports chapter-sync kinds', async () => {
    await enqueueJob('mangadex_chapter_sync', { seriesId: 8 });
    expect(await activeJobKindsForSeries(8)).toEqual(['mangadex_chapter_sync']);
  });
});
