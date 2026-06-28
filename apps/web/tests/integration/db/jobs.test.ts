import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { closeDb, getDb } from '@/server/db/client.js';
import {
  enqueueJob,
  claimNextJob,
  recordJobResult,
  recordJobError,
  countJobsByStatus,
  hasPendingImportFor,
} from '@/server/db/jobs.js';

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'bk-jobs-'));
  process.env.BOOKKEEPRR_DB_PATH = join(tmp, 'test.db');
  migrate(getDb(), { migrationsFolder: './drizzle' });
});
afterEach(() => {
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

describe('jobs queue', () => {
  it('enqueueJob then claimNextJob returns the row', async () => {
    const id = await enqueueJob('tick', { foo: 1 });
    const claimed = await claimNextJob('tick');
    expect(claimed?.id).toBe(id);
    expect(claimed?.status).toBe('running');
    expect(claimed?.payloadJson).toBe('{"foo":1}');
  });

  it('claimNextJob returns null when no pending jobs', async () => {
    expect(await claimNextJob('tick')).toBeNull();
  });

  it('claimNextJob only returns jobs of the requested kind', async () => {
    await enqueueJob('other', {});
    expect(await claimNextJob('tick')).toBeNull();
  });

  it('FIFO order for same kind', async () => {
    const a = await enqueueJob('tick', { n: 1 });
    const b = await enqueueJob('tick', { n: 2 });
    const first = await claimNextJob('tick');
    const second = await claimNextJob('tick');
    expect(first?.id).toBe(a);
    expect(second?.id).toBe(b);
  });

  it('two concurrent claims do not return the same job', async () => {
    await enqueueJob('tick', {});
    const [a, b] = await Promise.all([claimNextJob('tick'), claimNextJob('tick')]);
    const claimed = [a, b].filter((x) => x !== null);
    expect(claimed).toHaveLength(1);
  });

  it('recordJobResult marks completed', async () => {
    const id = await enqueueJob('tick', {});
    await claimNextJob('tick');
    await recordJobResult(id, { ok: true });
    const counts = await countJobsByStatus('tick');
    expect(counts.completed).toBe(1);
    expect(counts.running).toBe(0);
  });

  it('recordJobError reschedules with attempt++ when under max attempts', async () => {
    const id = await enqueueJob('tick', {});
    await claimNextJob('tick');
    await recordJobError(id, 'boom', { maxAttempts: 3 });
    const counts = await countJobsByStatus('tick');
    expect(counts.pending).toBe(1);
    expect(counts.failed).toBe(0);
  });

  it('recordJobError marks failed when max attempts reached', async () => {
    const id = await enqueueJob('tick', {});
    await claimNextJob('tick');
    await recordJobError(id, 'boom 1', { maxAttempts: 2 });
    // Advance time past the backoff so the job is claimable again.
    getDb().$client.exec(`UPDATE jobs SET scheduled_for = 0 WHERE status='pending'`);
    await claimNextJob('tick');
    await recordJobError(id, 'boom 2', { maxAttempts: 2 });
    const counts = await countJobsByStatus('tick');
    expect(counts.failed).toBe(1);
    expect(counts.pending).toBe(0);
  });
});

describe('hasPendingImportFor', () => {
  it('true when a pending import job exists for the downloadId', async () => {
    await enqueueJob('import', { downloadId: 7 });
    expect(await hasPendingImportFor(7)).toBe(true);
  });

  it('true when a running import job exists for the downloadId', async () => {
    await enqueueJob('import', { downloadId: 7 });
    await claimNextJob('import'); // → status 'running'
    expect(await hasPendingImportFor(7)).toBe(true);
  });

  it('false when no import job exists', async () => {
    expect(await hasPendingImportFor(7)).toBe(false);
  });

  it('false for a different downloadId', async () => {
    await enqueueJob('import', { downloadId: 7 });
    expect(await hasPendingImportFor(8)).toBe(false);
  });

  it('false when the only import job for the id has completed', async () => {
    const id = await enqueueJob('import', { downloadId: 7 });
    await claimNextJob('import');
    await recordJobResult(id, { ok: true });
    expect(await hasPendingImportFor(7)).toBe(false);
  });

  it('ignores non-import kinds with a matching downloadId payload', async () => {
    await enqueueJob('qbt_watch', { downloadId: 7 });
    expect(await hasPendingImportFor(7)).toBe(false);
  });
});
