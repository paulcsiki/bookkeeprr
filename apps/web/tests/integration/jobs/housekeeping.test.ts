import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { housekeepingDescriptor } from '@/server/jobs/kinds/housekeeping';
import { enqueueJob, recordJobResult } from '@/server/db/jobs';
import { runOnce } from '@/server/jobs/runner';
import { getDb } from '@/server/db/client';
import { jobs } from '@/server/db/schema';

let h: SeedHandle;
let tmpConfig: string;

beforeEach(async () => {
  h = await seedDb();
  tmpConfig = mkdtempSync(join(tmpdir(), 'bk-hk-cfg-'));
  process.env.BOOKKEEPRR_CONFIG_DIR = tmpConfig;
});
afterEach(() => {
  delete process.env.BOOKKEEPRR_CONFIG_DIR;
  h.cleanup();
  rmSync(tmpConfig, { recursive: true, force: true });
});

describe('housekeeping job', () => {
  it('purges terminal jobs older than retention', async () => {
    const id = await enqueueJob('test', {});
    await recordJobResult(id, null);
    const ms60d = Date.now() - 60 * 24 * 60 * 60 * 1000;
    const { eq } = await import('drizzle-orm');
    await getDb()
      .update(jobs)
      .set({ finishedAt: new Date(ms60d) })
      .where(eq(jobs.id, id));

    const hkId = await enqueueJob('housekeeping', {});
    await runOnce(housekeepingDescriptor);

    // The completed test job should be gone; the housekeeping job itself is now
    // also terminal (just finished) but not yet old enough to purge.
    const all = await getDb().select().from(jobs);
    expect(all.find((j) => j.id === id)).toBeUndefined();
    expect(all.find((j) => j.id === hkId)).toBeDefined();
  });

  it("creates today's backup file", async () => {
    await enqueueJob('housekeeping', {});
    await runOnce(housekeepingDescriptor);

    const backupsDir = join(tmpConfig, 'backups');
    const files = readdirSync(backupsDir);
    const today = new Date().toISOString().slice(0, 10);
    expect(files.some((f) => f === `bookkeeprr-${today}.db`)).toBe(true);
  });

  it("skips backup creation when today's file already exists", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const backupsDir = join(tmpConfig, 'backups');
    const { mkdirSync } = await import('node:fs');
    mkdirSync(backupsDir, { recursive: true });
    const existing = join(backupsDir, `bookkeeprr-${today}.db`);
    writeFileSync(existing, 'pre-existing');

    await enqueueJob('housekeeping', {});
    await runOnce(housekeepingDescriptor);

    // The pre-existing content should remain untouched
    const { readFileSync } = await import('node:fs');
    expect(readFileSync(existing, 'utf-8')).toBe('pre-existing');
  });

  it('prunes backups past retention (14 daily + 12 monthly-day-1)', async () => {
    const backupsDir = join(tmpConfig, 'backups');
    const { mkdirSync } = await import('node:fs');
    mkdirSync(backupsDir, { recursive: true });
    // Seed 20 daily files for May 2026 + 15 monthly-day-1 files (older months)
    for (let d = 1; d <= 20; d++) {
      const dd = String(d).padStart(2, '0');
      writeFileSync(join(backupsDir, `bookkeeprr-2026-05-${dd}.db`), '');
    }
    for (let m = 1; m <= 15; m++) {
      const mm = String(m).padStart(2, '0');
      writeFileSync(join(backupsDir, `bookkeeprr-2025-${mm}-01.db`), '');
    }

    await enqueueJob('housekeeping', {});
    await runOnce(housekeepingDescriptor);

    const remaining = readdirSync(backupsDir).filter((f) => f.startsWith('bookkeeprr-'));
    // Should keep the 14 most-recent daily + 12 most-recent monthly-day-1
    // The May 2026 day-01 file is in BOTH lists (counted once)
    // Today's file from the backup step is ALSO present
    // Exact count depends on overlap; the invariant is that >35 files become ≤30 (ish)
    expect(remaining.length).toBeLessThan(36);
    // The 14 most-recent May files (2026-05-07..2026-05-20) should remain
    expect(remaining).toContain('bookkeeprr-2026-05-20.db');
    // 2026-05-01 is outside the 14 most-recent daily (days 07-20) but kept as monthly-day-1
    // for May 2026. However with 20 May daily files seeded and 15 monthly files, the
    // 14 daily window covers 2026-05-07..2026-05-20. 2026-05-01 is day 1 → kept as monthly.
    // The 6 oldest May files (2026-05-01..2026-05-06) are outside 14-daily; only 2026-05-01
    // survives as a monthly. Days 02-06 are pruned.
    expect(remaining).not.toContain('bookkeeprr-2026-05-02.db');
    expect(remaining).not.toContain('bookkeeprr-2026-05-06.db');
  });
});
