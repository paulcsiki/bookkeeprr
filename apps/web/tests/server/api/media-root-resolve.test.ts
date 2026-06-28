/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { closeDb, getDb } from '@/server/db/client';
import { getMediaRoot } from '@/server/content-type/paths';
import { mediaRootSetting } from '@/server/db/settings/library';

describe('getMediaRoot resolution', () => {
  const orig = process.env.BOOKKEEPRR_MEDIA_ROOT;
  let dir: string;
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'mr-'));
    // Isolate the DB to this temp dir — these tests write the mediaRoot setting,
    // which without an explicit BOOKKEEPRR_DB_PATH would land in ./bookkeeprr.dev.db.
    process.env.BOOKKEEPRR_DB_PATH = join(dir, 'test.db');
    await closeDb();
    migrate(getDb(), { migrationsFolder: resolve(__dirname, '../../../drizzle') });
  });
  afterEach(async () => {
    if (orig === undefined) delete process.env.BOOKKEEPRR_MEDIA_ROOT;
    else process.env.BOOKKEEPRR_MEDIA_ROOT = orig;
    await closeDb();
    delete process.env.BOOKKEEPRR_DB_PATH;
    rmSync(dir, { recursive: true, force: true });
  });

  it('prefers the env var when set', async () => {
    process.env.BOOKKEEPRR_MEDIA_ROOT = '/from-env';
    await mediaRootSetting.set('/from-setting');
    expect(await getMediaRoot()).toBe('/from-env');
  });

  it('falls back to the saved setting when env is unset', async () => {
    delete process.env.BOOKKEEPRR_MEDIA_ROOT;
    await mediaRootSetting.set(dir);
    expect(await getMediaRoot()).toBe(dir);
  });

  it('defaults to /media when neither is set', async () => {
    delete process.env.BOOKKEEPRR_MEDIA_ROOT;
    await mediaRootSetting.set('');
    expect(await getMediaRoot()).toBe('/media');
  });
});
