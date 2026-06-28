import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { closeDb, getDb } from '@/server/db/client.js';
import { defineSetting } from '@/server/db/settings.js';

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

const mediaRoot = defineSetting('paths.media_root', z.string(), '/media');

describe('settings', () => {
  it('returns default when no row exists', async () => {
    expect(await mediaRoot.get()).toBe('/media');
  });

  it('persists and reads a value', async () => {
    await mediaRoot.set('/srv/media');
    expect(await mediaRoot.get()).toBe('/srv/media');
  });

  it('rejects invalid values at the boundary', async () => {
    const num = defineSetting('test.num', z.number(), 0);
    // @ts-expect-error intentional misuse
    await expect(num.set('not-a-number')).rejects.toThrow();
  });
});
