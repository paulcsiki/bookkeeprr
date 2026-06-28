import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { closeDb, getDb } from '@/server/db/client';
import { imageCacheSetting } from '@/server/db/settings/library';
import { purgeCachedImage, purgeCachedImages } from '@/server/images/cache';

let tmp: string;
let cacheDir: string;

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'bk-purge-'));
  cacheDir = join(tmp, 'cache');
  mkdirSync(cacheDir, { recursive: true });
  process.env.BOOKKEEPRR_DB_PATH = join(tmp, 'test.db');
  migrate(getDb(), { migrationsFolder: './drizzle' });
  await imageCacheSetting.set({ enabled: true, dir: cacheDir });
});

afterEach(() => {
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

/** Create a fake cache file at the content-addressed path for `url` + `ext`. */
function seedCacheFile(url: string, ext: string): string {
  const hash = createHash('sha256').update(url).digest('hex');
  const file = join(cacheDir, hash + ext);
  writeFileSync(file, 'fake-bytes');
  return file;
}

describe('purgeCachedImage', () => {
  it('unlinks the cached file for a url (jpg)', async () => {
    const url = 'https://uploads.mangadex.org/covers/a/b.jpg';
    const file = seedCacheFile(url, '.jpg');
    expect(existsSync(file)).toBe(true);
    await purgeCachedImage(url);
    expect(existsSync(file)).toBe(false);
  });

  it('unlinks across candidate extensions', async () => {
    const url = 'https://s4.anilist.co/file/x.png';
    const file = seedCacheFile(url, '.png');
    await purgeCachedImage(url);
    expect(existsSync(file)).toBe(false);
  });

  it('is a no-op when no cache file exists', async () => {
    await expect(purgeCachedImage('https://uploads.mangadex.org/none.jpg')).resolves.toBeUndefined();
  });

  it('ignores null / empty urls', async () => {
    await expect(purgeCachedImage(null)).resolves.toBeUndefined();
    await expect(purgeCachedImage('')).resolves.toBeUndefined();
  });
});

describe('purgeCachedImages', () => {
  it('purges several urls best-effort', async () => {
    const a = 'https://uploads.mangadex.org/covers/a.jpg';
    const b = 'https://covers.openlibrary.org/b-L.jpg';
    const fileA = seedCacheFile(a, '.jpg');
    const fileB = seedCacheFile(b, '.webp');
    await purgeCachedImages([a, null, b, undefined]);
    expect(existsSync(fileA)).toBe(false);
    expect(existsSync(fileB)).toBe(false);
  });
});
