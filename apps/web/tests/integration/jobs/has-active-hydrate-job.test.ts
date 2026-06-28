import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { closeDb, getDb } from '@/server/db/client';
import { enqueueJob, claimNextJob, recordJobResult, hasActiveHydrateJob } from '@/server/db/jobs';

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'bk-haj-'));
  process.env.BOOKKEEPRR_DB_PATH = join(tmp, 'test.db');
  migrate(getDb(), { migrationsFolder: './drizzle' });
});
afterEach(() => {
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

describe('hasActiveHydrateJob', () => {
  it('returns false when there are no jobs', async () => {
    expect(await hasActiveHydrateJob(1)).toBe(false);
  });

  it('returns true for a pending metadata_hydrate job for the series', async () => {
    await enqueueJob('metadata_hydrate', { seriesId: 7 });
    expect(await hasActiveHydrateJob(7)).toBe(true);
  });

  it('returns true for a running comicvine_hydrate job for the series', async () => {
    await enqueueJob('comicvine_hydrate', { seriesId: 9 });
    await claimNextJob('comicvine_hydrate'); // -> running
    expect(await hasActiveHydrateJob(9)).toBe(true);
  });

  it('returns true for a pending novel_updates_hydrate job for the series', async () => {
    await enqueueJob('novel_updates_hydrate', { seriesId: 11 });
    expect(await hasActiveHydrateJob(11)).toBe(true);
  });

  it('returns false for a hydrate job belonging to a different series', async () => {
    await enqueueJob('metadata_hydrate', { seriesId: 100 });
    expect(await hasActiveHydrateJob(200)).toBe(false);
  });

  it('returns false for a non-hydrate kind for the series', async () => {
    await enqueueJob('library_scan', { seriesId: 5 });
    expect(await hasActiveHydrateJob(5)).toBe(false);
  });

  it('returns false once the hydrate job has completed', async () => {
    await enqueueJob('metadata_hydrate', { seriesId: 3 });
    const claimed = await claimNextJob('metadata_hydrate');
    await recordJobResult(claimed!.id, { volumesAdded: 0 });
    expect(await hasActiveHydrateJob(3)).toBe(false);
  });
});
