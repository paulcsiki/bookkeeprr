/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { closeDb, getDb } from '@/server/db/client';
import { resolveFirstRunPaths } from '@/server/first-run/paths';
import { GET as checkPathsGET } from '@/app/api/first-run/check-paths/route';
import { POST as mediaRootPOST } from '@/app/api/first-run/media-root/route';

describe('resolveFirstRunPaths', () => {
  let dir: string;
  const orig = { c: process.env.BOOKKEEPRR_CONFIG_DIR, m: process.env.BOOKKEEPRR_MEDIA_ROOT };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fr-paths-'));
  });
  afterEach(() => {
    if (orig.c === undefined) delete process.env.BOOKKEEPRR_CONFIG_DIR;
    else process.env.BOOKKEEPRR_CONFIG_DIR = orig.c;
    if (orig.m === undefined) delete process.env.BOOKKEEPRR_MEDIA_ROOT;
    else process.env.BOOKKEEPRR_MEDIA_ROOT = orig.m;
    rmSync(dir, { recursive: true, force: true });
  });

  it('reports writable for an existing writable dir', async () => {
    process.env.BOOKKEEPRR_CONFIG_DIR = dir;
    process.env.BOOKKEEPRR_MEDIA_ROOT = dir;
    const r = await resolveFirstRunPaths();
    expect(r.configDir.path).toBe(dir);
    expect(r.configDir.status).toBe('writable');
    expect(r.mediaRoot.status).toBe('writable');
  });

  it('reports missing for a non-existent dir', async () => {
    process.env.BOOKKEEPRR_CONFIG_DIR = join(dir, 'nope');
    process.env.BOOKKEEPRR_MEDIA_ROOT = dir;
    const r = await resolveFirstRunPaths();
    expect(r.configDir.status).toBe('missing');
  });

  it('reports env-set flags', async () => {
    process.env.BOOKKEEPRR_CONFIG_DIR = dir;
    process.env.BOOKKEEPRR_MEDIA_ROOT = dir;
    const r = await resolveFirstRunPaths();
    expect(r.configEnvSet).toBe(true);
    expect(r.mediaEnvSet).toBe(true);
  });
});

// These endpoints persist the mediaRoot setting, so they need an isolated DB —
// without an explicit BOOKKEEPRR_DB_PATH getDb() would write ./bookkeeprr.dev.db.
describe('first-run media-root endpoints', () => {
  let dbDir: string;
  beforeEach(async () => {
    dbDir = mkdtempSync(join(tmpdir(), 'fr-db-'));
    process.env.BOOKKEEPRR_DB_PATH = join(dbDir, 'test.db');
    await closeDb();
    migrate(getDb(), { migrationsFolder: resolve(__dirname, '../../../drizzle') });
  });
  afterEach(async () => {
    await closeDb();
    delete process.env.BOOKKEEPRR_DB_PATH;
    rmSync(dbDir, { recursive: true, force: true });
  });

  it('check-paths validates a candidate media path', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fr-cp-'));
    try {
      const res = await checkPathsGET(new Request(`http://x/api/first-run/check-paths?mediaRoot=${encodeURIComponent(dir)}`));
      const body = (await res.json()) as { mediaRoot: { status: string } };
      expect(body.mediaRoot.status).toBe('writable');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('media-root save rejects a non-writable path and accepts a writable one', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fr-mr-'));
    try {
      const bad = await mediaRootPOST(new Request('http://x', { method: 'POST', body: JSON.stringify({ path: join(dir, 'missing') }) }));
      expect(bad.status).toBe(400);
      const ok = await mediaRootPOST(new Request('http://x', { method: 'POST', body: JSON.stringify({ path: dir }) }));
      expect(ok.status).toBe(200);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
