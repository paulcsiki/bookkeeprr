import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'node:path';
import { closeDb, getDb } from '@/server/db/client';
import { comicVineApiKeySetting } from '@/server/db/settings/comicvine';
import { GET, type DiscoverSource } from '@/app/api/discover/sources/route';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'bk-discover-sources-'));
  process.env.BOOKKEEPRR_CONFIG_DIR = tmpDir;
  // Pin the DB to this temp dir and drop any connection a prior test in the same
  // worker left open against a different path — otherwise the cached singleton
  // (and its settings, e.g. a leaked ComicVine key) bleeds in.
  process.env.BOOKKEEPRR_DB_PATH = join(tmpDir, 'test.db');
  await closeDb();
  const db = getDb();
  const migrationsFolder = path.resolve(__dirname, '../../../../drizzle');
  migrate(db, { migrationsFolder });
});

afterEach(async () => {
  await closeDb();
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.BOOKKEEPRR_DB_PATH;
});

describe('GET /api/discover/sources', () => {
  it('returns all 5 sources, comicvine unconfigured when no api key', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as { sources: DiscoverSource[] };
    expect(body.sources).toHaveLength(5);
    const ids = body.sources.map((s) => s.id);
    expect(ids).toContain('anilist');
    expect(ids).toContain('mangadex');
    expect(ids).toContain('comicvine');
    expect(ids).toContain('openlibrary');
    expect(ids).toContain('audnex');
    const cv = body.sources.find((s) => s.id === 'comicvine')!;
    expect(cv.configured).toBe(false);
  });

  it('returns comicvine configured=true when api key is set', async () => {
    await comicVineApiKeySetting.set('my-api-key');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as { sources: DiscoverSource[] };
    const cv = body.sources.find((s) => s.id === 'comicvine')!;
    expect(cv.configured).toBe(true);
  });

  it('non-comicvine sources always configured=true', async () => {
    const res = await GET();
    const body = await res.json() as { sources: DiscoverSource[] };
    const others = body.sources.filter((s) => s.id !== 'comicvine');
    for (const s of others) {
      expect(s.configured).toBe(true);
    }
  });
});
