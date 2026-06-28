import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { closeDb, getDb } from '@/server/db/client';
import { enqueueJob, claimNextJob, recordJobError } from '@/server/db/jobs';
import { jobs } from '@/server/db/schema';
import { eq } from 'drizzle-orm';

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'bk-cap-'));
  process.env.BOOKKEEPRR_DB_PATH = join(tmp, 'test.db');
  migrate(getDb(), { migrationsFolder: './drizzle' });
});
afterEach(() => {
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

describe('jobs backoff cap', () => {
  it('caps exponential backoff at 1 hour', async () => {
    const id = await enqueueJob('cap', {});
    await getDb().update(jobs).set({ attempt: 19 }).where(eq(jobs.id, id));
    await claimNextJob('cap');
    const beforeMs = Date.now();
    await recordJobError(id, 'boom', { maxAttempts: 100 });
    const row = await getDb().select().from(jobs).where(eq(jobs.id, id)).limit(1);
    const diffMs = row[0]!.scheduledFor.getTime() - beforeMs;
    expect(diffMs).toBeLessThanOrEqual(3_600_000 + 5_000);
    expect(diffMs).toBeGreaterThanOrEqual(3_600_000 - 5_000);
  });
});
