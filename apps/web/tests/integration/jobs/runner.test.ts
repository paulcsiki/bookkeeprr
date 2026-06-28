import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { closeDb, getDb } from '@/server/db/client.js';
import { enqueueJob, countJobsByStatus } from '@/server/db/jobs.js';
import { runOnce } from '@/server/jobs/runner.js';

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'bk-run-'));
  process.env.BOOKKEEPRR_DB_PATH = join(tmp, 'test.db');
  migrate(getDb(), { migrationsFolder: './drizzle' });
});
afterEach(() => {
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

describe('runner.runOnce', () => {
  it('runs handler and records completion', async () => {
    let receivedPayload: unknown = null;
    await enqueueJob('echo', { hello: 'world' });

    const result = await runOnce({
      kind: 'echo',
      handler: async (payload) => {
        receivedPayload = payload;
        return { ok: true };
      },
      retryPolicy: { maxAttempts: 1 },
      timeoutMs: 5000,
    });

    expect(result).toBe('ran');
    expect(receivedPayload).toEqual({ hello: 'world' });
    const counts = await countJobsByStatus('echo');
    expect(counts.completed).toBe(1);
  });

  it('returns "idle" when no jobs pending', async () => {
    const r = await runOnce({
      kind: 'echo',
      handler: async () => null,
      retryPolicy: { maxAttempts: 1 },
      timeoutMs: 5000,
    });
    expect(r).toBe('idle');
  });

  it('records error and reschedules on handler throw (attempt < max)', async () => {
    await enqueueJob('boom', {});
    const r = await runOnce({
      kind: 'boom',
      handler: async () => {
        throw new Error('kaboom');
      },
      retryPolicy: { maxAttempts: 3 },
      timeoutMs: 5000,
    });
    expect(r).toBe('ran');
    const counts = await countJobsByStatus('boom');
    expect(counts.pending).toBe(1);
    expect(counts.failed).toBe(0);
  });

  it('marks failed when max attempts exhausted', async () => {
    await enqueueJob('boom', {});
    for (let i = 0; i < 2; i++) {
      await runOnce({
        kind: 'boom',
        handler: async () => {
          throw new Error('kaboom');
        },
        retryPolicy: { maxAttempts: 2 },
        timeoutMs: 5000,
      });
      // Advance scheduled_for past the backoff so the next runOnce can claim.
      getDb().$client.exec(`UPDATE jobs SET scheduled_for = 0 WHERE status='pending'`);
    }
    const counts = await countJobsByStatus('boom');
    expect(counts.failed).toBe(1);
  });

  it('marks failed on handler timeout', async () => {
    await enqueueJob('slow', {});
    const r = await runOnce({
      kind: 'slow',
      handler: () => new Promise((resolve) => setTimeout(resolve, 1000)),
      retryPolicy: { maxAttempts: 1 },
      timeoutMs: 50,
    });
    expect(r).toBe('ran');
    const counts = await countJobsByStatus('slow');
    expect(counts.failed).toBe(1);
  });
});
