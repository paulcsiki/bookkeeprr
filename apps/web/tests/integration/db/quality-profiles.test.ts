import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { closeDb, getDb } from '@/server/db/client.js';
import {
  insertQualityProfile,
  listQualityProfiles,
  getQualityProfile,
  seedDefaultQualityProfile,
} from '@/server/db/quality-profiles.js';

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'bk-qp-'));
  process.env.BOOKKEEPRR_DB_PATH = join(tmp, 'test.db');
  migrate(getDb(), { migrationsFolder: './drizzle' });
});
afterEach(() => {
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

describe('quality-profiles', () => {
  it('seedDefaultQualityProfile inserts one row if empty', async () => {
    const id = await seedDefaultQualityProfile();
    const all = await listQualityProfiles();
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe(id);
    expect(all[0]?.name).toBe('Default');
  });

  it('seedDefaultQualityProfile is idempotent', async () => {
    const id1 = await seedDefaultQualityProfile();
    const id2 = await seedDefaultQualityProfile();
    expect(id1).toBe(id2);
    const all = await listQualityProfiles();
    expect(all).toHaveLength(1);
  });

  it('insertQualityProfile creates and getQualityProfile fetches', async () => {
    const id = await insertQualityProfile({ name: 'Strict' });
    const row = await getQualityProfile(id);
    expect(row?.name).toBe('Strict');
    expect(row?.preferCompleteBatches).toBe(false);
  });
});
