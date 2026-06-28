import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { closeDb, getDb } from '@/server/db/client';
import { enqueueJob, countJobsByStatus } from '@/server/db/jobs';
import { runUntilIdle } from '@/server/jobs/runner';

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'bk-rui-'));
  process.env.BOOKKEEPRR_DB_PATH = join(tmp, 'test.db');
  migrate(getDb(), { migrationsFolder: './drizzle' });
});
afterEach(() => {
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

describe('runner.runUntilIdle', () => {
  it('drains all pending jobs of a kind', async () => {
    await enqueueJob('drain', { n: 1 });
    await enqueueJob('drain', { n: 2 });
    await enqueueJob('drain', { n: 3 });
    let invocations = 0;
    const count = await runUntilIdle({
      kind: 'drain',
      handler: async () => {
        invocations++;
        return null;
      },
      retryPolicy: { maxAttempts: 1 },
      timeoutMs: 5000,
    });
    expect(count).toBe(3);
    expect(invocations).toBe(3);
    const counts = await countJobsByStatus('drain');
    expect(counts.completed).toBe(3);
  });

  it('returns 0 when no jobs pending', async () => {
    const count = await runUntilIdle({
      kind: 'drain',
      handler: async () => null,
      retryPolicy: { maxAttempts: 1 },
      timeoutMs: 5000,
    });
    expect(count).toBe(0);
  });
});
