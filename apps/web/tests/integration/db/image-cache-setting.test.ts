import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { closeDb, getDb } from '@/server/db/client';
import {
  getImageCacheDir,
  imageCacheSetting,
} from '@/server/db/settings/library';

let tmp: string;
const ORIG_CONFIG_DIR = process.env.BOOKKEEPRR_CONFIG_DIR;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'bk-imgcache-'));
  process.env.BOOKKEEPRR_DB_PATH = join(tmp, 'test.db');
  migrate(getDb(), { migrationsFolder: './drizzle' });
});

afterEach(() => {
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
  if (ORIG_CONFIG_DIR === undefined) delete process.env.BOOKKEEPRR_CONFIG_DIR;
  else process.env.BOOKKEEPRR_CONFIG_DIR = ORIG_CONFIG_DIR;
});

describe('imageCacheSetting', () => {
  it('defaults to disabled with a blank dir', async () => {
    expect(await imageCacheSetting.get()).toEqual({ enabled: false, dir: '' });
  });

  it('persists and reads a value', async () => {
    await imageCacheSetting.set({ enabled: true, dir: '/srv/covers' });
    expect(await imageCacheSetting.get()).toEqual({ enabled: true, dir: '/srv/covers' });
  });

  it('rejects unknown keys (strict)', async () => {
    await expect(
      // @ts-expect-error intentional extra key
      imageCacheSetting.set({ enabled: true, dir: '', extra: 1 }),
    ).rejects.toThrow();
  });

  it('rejects a non-boolean enabled', async () => {
    await expect(
      // @ts-expect-error intentional bad type
      imageCacheSetting.set({ enabled: 'yes', dir: '' }),
    ).rejects.toThrow();
  });
});

describe('getImageCacheDir', () => {
  it('returns the configured dir when non-empty', async () => {
    await imageCacheSetting.set({ enabled: true, dir: '/srv/covers' });
    expect(await getImageCacheDir()).toBe('/srv/covers');
  });

  it('falls back to BOOKKEEPRR_CONFIG_DIR/cache/images when dir is blank', async () => {
    process.env.BOOKKEEPRR_CONFIG_DIR = '/etc/bookkeeprr';
    expect(await getImageCacheDir()).toBe('/etc/bookkeeprr/cache/images');
  });

  it('falls back to /config/cache/images when no config dir is set', async () => {
    delete process.env.BOOKKEEPRR_CONFIG_DIR;
    expect(await getImageCacheDir()).toBe('/config/cache/images');
  });
});
