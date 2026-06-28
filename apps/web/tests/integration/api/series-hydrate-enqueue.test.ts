import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { closeDb, getDb } from '@/server/db/client';
import { seedDefaultQualityProfile } from '@/server/db/quality-profiles';
import { POST } from '@/app/api/series/route';
import { countJobsByStatus } from '@/server/db/jobs';

let tmp: string;
let qpId: number;
beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'bk-hy-'));
  process.env.BOOKKEEPRR_DB_PATH = join(tmp, 'test.db');
  migrate(getDb(), { migrationsFolder: './drizzle' });
  qpId = await seedDefaultQualityProfile();
});
afterEach(() => {
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

function req(body: unknown): Request {
  return new Request('http://localhost/api/series', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/series enqueues metadata_hydrate', () => {
  it('creates a hydrate job after a successful add', async () => {
    const res = await POST(
      req({
        anilistId: 999,
        status: 'releasing',
        rootPath: '/x',
        qualityProfileId: qpId,
      }),
    );
    expect(res.status).toBe(201);
    const counts = await countJobsByStatus('metadata_hydrate');
    expect(counts.pending).toBe(1);
  });
});
