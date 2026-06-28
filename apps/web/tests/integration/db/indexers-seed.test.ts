import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { closeDb, getDb } from '@/server/db/client';
import { seedDefaultIndexers, listIndexers, deleteIndexer } from '@/server/db/indexers';
import { seededIndexerKindsSetting } from '@/server/db/settings/seeded-indexers';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'bk-m29-seed-'));
  process.env.BOOKKEEPRR_DB_PATH = join(tmp, 'test.db');
  migrate(getDb(), { migrationsFolder: './drizzle' });
});
afterEach(() => {
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

describe('seedDefaultIndexers + seededIndexerKindsSetting', () => {
  it('seeds both kinds on a fresh DB and records them in the setting', async () => {
    const initial = await seededIndexerKindsSetting.get();
    expect(initial).toEqual([]);

    await seedDefaultIndexers();

    const rows = await listIndexers();
    const kinds = new Set(rows.map((r) => r.kind));
    expect(kinds.has('nyaa')).toBe(true);
    expect(kinds.has('filelist')).toBe(true);

    const seeded = await seededIndexerKindsSetting.get();
    expect(seeded.sort()).toEqual(['filelist', 'nyaa']);
  });

  it('does NOT re-seed a kind after the user deletes it', async () => {
    await seedDefaultIndexers();
    const beforeDelete = await listIndexers();
    const nyaa = beforeDelete.find((r) => r.kind === 'nyaa');
    expect(nyaa).toBeDefined();

    await deleteIndexer(nyaa!.id);
    expect((await listIndexers()).find((r) => r.kind === 'nyaa')).toBeUndefined();

    // Simulated worker restart — call seedDefaultIndexers again.
    await seedDefaultIndexers();

    // nyaa is NOT recreated because it's in the seeded list.
    expect((await listIndexers()).find((r) => r.kind === 'nyaa')).toBeUndefined();
  });

  it('idempotent fix-up: existing rows pre-M29 add their kinds to the setting', async () => {
    // Simulate pre-M29: seed once (which updates setting), then reset setting to empty.
    await seedDefaultIndexers();
    await seededIndexerKindsSetting.set([]);

    // Second call must NOT insert duplicates AND must populate the setting.
    await seedDefaultIndexers();

    const rows = await listIndexers();
    const nyaaRows = rows.filter((r) => r.kind === 'nyaa');
    const filelistRows = rows.filter((r) => r.kind === 'filelist');
    expect(nyaaRows.length).toBe(1);
    expect(filelistRows.length).toBe(1);

    const seeded = await seededIndexerKindsSetting.get();
    expect(seeded.sort()).toEqual(['filelist', 'nyaa']);
  });
});
