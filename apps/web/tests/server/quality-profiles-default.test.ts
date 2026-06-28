import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { closeDb, getDb } from '@/server/db/client';
import {
  insertQualityProfile,
  listQualityProfiles,
  getDefaultQualityProfile,
  setDefaultQualityProfile,
} from '@/server/db/quality-profiles';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'bk-qp-default-'));
  process.env.BOOKKEEPRR_DB_PATH = join(tmp, 'test.db');
  migrate(getDb(), { migrationsFolder: './drizzle' });
});

afterEach(() => {
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

describe('quality profile defaults', () => {
  it('setDefaultQualityProfile leaves exactly one default and is idempotent on switch', async () => {
    const a = await insertQualityProfile({ name: 'A' });
    const b = await insertQualityProfile({ name: 'B' });

    await setDefaultQualityProfile(a);
    await setDefaultQualityProfile(b);

    const all = await listQualityProfiles();
    const defaults = all.filter((p) => p.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0]!.id).toBe(b);

    const def = await getDefaultQualityProfile();
    expect(def?.id).toBe(b);
  });

  it('getDefaultQualityProfile lazily marks the lowest-id profile when none is set', async () => {
    const a = await insertQualityProfile({ name: 'A' });
    const b = await insertQualityProfile({ name: 'B' });
    expect(b).toBeGreaterThan(a);

    // none explicitly set as default
    const all = await listQualityProfiles();
    expect(all.every((p) => !p.isDefault)).toBe(true);

    const first = await getDefaultQualityProfile();
    expect(first?.id).toBe(a);
    expect(first?.isDefault).toBe(true);

    // second call returns the same one (now persisted)
    const second = await getDefaultQualityProfile();
    expect(second?.id).toBe(a);

    const onlyDefaults = (await listQualityProfiles()).filter((p) => p.isDefault);
    expect(onlyDefaults).toHaveLength(1);
    expect(onlyDefaults[0]!.id).toBe(a);
  });

  it('getDefaultQualityProfile returns null when there are zero profiles', async () => {
    const all = await listQualityProfiles();
    expect(all).toHaveLength(0);
    const def = await getDefaultQualityProfile();
    expect(def).toBeNull();
  });
});
