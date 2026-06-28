import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { closeDb, getDb } from '@/server/db/client.js';
import { computeHealth, heartbeatSetting } from '@/server/health.js';
import { GET as healthRoute } from '@/app/api/health/route';
import { expectShape } from '../../helpers/assert-spec';
import { HealthResponse } from '@/server/openapi/schemas/system';

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'bk-'));
  process.env.BOOKKEEPRR_DB_PATH = join(tmp, 'test.db');
  migrate(getDb(), { migrationsFolder: './drizzle' });
});
afterEach(() => {
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

describe('health', () => {
  it('reports unhealthy when no heartbeat exists', async () => {
    const result = await computeHealth(Date.now());
    expect(result.status).toBe('unhealthy');
    expect(result.worker.heartbeatAgeMs).toBeNull();
  });

  it('reports healthy when heartbeat is recent', async () => {
    const now = Date.now();
    await heartbeatSetting.set(now - 30_000);
    const result = await computeHealth(now);
    expect(result.status).toBe('healthy');
    expect(result.worker.heartbeatAgeMs).toBe(30_000);
  });

  it('reports unhealthy when heartbeat is stale', async () => {
    const now = Date.now();
    await heartbeatSetting.set(now - 5 * 60_000);
    const result = await computeHealth(now);
    expect(result.status).toBe('unhealthy');
    expect(result.worker.heartbeatAgeMs).toBe(5 * 60_000);
  });
});

describe('GET /api/health', () => {
  it('returns 503 with the health body when no heartbeat exists', async () => {
    const res = await healthRoute();
    expect(res.status).toBe(503);
    await expectShape(HealthResponse, res, 'GET /api/health (unhealthy)');
  });

  it('returns 200 with the health body when the heartbeat is fresh', async () => {
    await heartbeatSetting.set(Date.now());
    const res = await healthRoute();
    expect(res.status).toBe(200);
    await expectShape(HealthResponse, res, 'GET /api/health');
  });
});
