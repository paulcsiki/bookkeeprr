import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { enqueueJob, recordJobResult, recordJobError } from '@/server/db/jobs';
import { purgeTerminalJobs, listBackupFiles } from '@/server/db/housekeeping';
import { getDb } from '@/server/db/client';
import { jobs } from '@/server/db/schema';

let h: SeedHandle;
let tmp: string;

beforeEach(async () => {
  h = await seedDb();
  tmp = mkdtempSync(join(tmpdir(), 'bk-hk-'));
});
afterEach(() => {
  h.cleanup();
  rmSync(tmp, { recursive: true, force: true });
});

describe('purgeTerminalJobs', () => {
  it('deletes completed jobs older than retention', async () => {
    const id = await enqueueJob('test', {});
    await recordJobResult(id, null);
    // Backdate finishedAt to 60 days ago
    const ms60d = Date.now() - 60 * 24 * 60 * 60 * 1000;
    const { eq } = await import('drizzle-orm');
    await getDb()
      .update(jobs)
      .set({ finishedAt: new Date(ms60d) })
      .where(eq(jobs.id, id));

    const deleted = await purgeTerminalJobs({ terminalDays: 30, errorDays: 90 });
    expect(deleted).toBe(1);
  });

  it('keeps completed jobs newer than retention', async () => {
    const id = await enqueueJob('test', {});
    await recordJobResult(id, null);
    const deleted = await purgeTerminalJobs({ terminalDays: 30, errorDays: 90 });
    expect(deleted).toBe(0);
  });

  it('uses errorDays for failed jobs', async () => {
    const id = await enqueueJob('test', {});
    await recordJobError(id, 'boom', { maxAttempts: 0 });
    // 45 days old: < 90 errorDays so KEPT even though > 30 terminalDays
    const ms45d = Date.now() - 45 * 24 * 60 * 60 * 1000;
    const { eq } = await import('drizzle-orm');
    await getDb()
      .update(jobs)
      .set({ finishedAt: new Date(ms45d) })
      .where(eq(jobs.id, id));

    const deleted = await purgeTerminalJobs({ terminalDays: 30, errorDays: 90 });
    expect(deleted).toBe(0);
  });

  it('deletes failed jobs older than errorDays', async () => {
    const id = await enqueueJob('test', {});
    // maxAttempts: 0 → attempt(0) >= maxAttempts(0) is true → job marked failed immediately
    await recordJobError(id, 'boom', { maxAttempts: 0 });
    // 100 days old: > 90 errorDays so deleted
    const ms100d = Date.now() - 100 * 24 * 60 * 60 * 1000;
    const { eq } = await import('drizzle-orm');
    await getDb()
      .update(jobs)
      .set({ finishedAt: new Date(ms100d) })
      .where(eq(jobs.id, id));

    const deleted = await purgeTerminalJobs({ terminalDays: 30, errorDays: 90 });
    expect(deleted).toBe(1);
  });

  it('keeps non-terminal (running) jobs regardless of age', async () => {
    const id = await enqueueJob('test', {});
    const { eq } = await import('drizzle-orm');
    const ms60d = Date.now() - 60 * 24 * 60 * 60 * 1000;
    await getDb()
      .update(jobs)
      .set({ status: 'running', startedAt: new Date(ms60d) })
      .where(eq(jobs.id, id));

    const deleted = await purgeTerminalJobs({ terminalDays: 30, errorDays: 90 });
    expect(deleted).toBe(0);
  });
});

describe('listBackupFiles', () => {
  it('returns empty for empty dir', () => {
    expect(listBackupFiles(tmp)).toEqual([]);
  });

  it('parses files matching bookkeeprr-YYYY-MM-DD.db', () => {
    writeFileSync(join(tmp, 'bookkeeprr-2026-01-15.db'), '');
    writeFileSync(join(tmp, 'bookkeeprr-2026-05-01.db'), '');
    writeFileSync(join(tmp, 'something-else.db'), '');
    const files = listBackupFiles(tmp);
    expect(files).toHaveLength(2);
    expect(files.map((f) => f.day).sort()).toEqual(['01', '15']);
    expect(files.map((f) => f.date).sort()).toEqual(['2026-01-15', '2026-05-01']);
  });

  it('returns files sorted by date descending', () => {
    writeFileSync(join(tmp, 'bookkeeprr-2026-01-15.db'), '');
    writeFileSync(join(tmp, 'bookkeeprr-2026-05-01.db'), '');
    writeFileSync(join(tmp, 'bookkeeprr-2026-03-22.db'), '');
    const files = listBackupFiles(tmp);
    expect(files.map((f) => f.date)).toEqual(['2026-05-01', '2026-03-22', '2026-01-15']);
  });
});
