import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { closeDb, getDb } from '@/server/db/client.js';
import { settings } from '@/server/db/schema.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'bk-'));
  process.env.BOOKKEEPRR_DB_PATH = join(tmp, 'test.db');
  const db = getDb();
  migrate(db, { migrationsFolder: './drizzle' });
});

afterEach(() => {
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

describe('db/client', () => {
  it('opens in WAL mode', () => {
    const db = getDb();
    const rows = db.$client.pragma('journal_mode') as { journal_mode: string }[];
    expect(rows[0]?.journal_mode).toBe('wal');
  });

  it('round-trips a settings row', async () => {
    const db = getDb();
    await db.insert(settings).values({ key: 'hello', valueJson: '"world"' });
    const all = await db.select().from(settings);
    expect(all).toHaveLength(1);
    expect(all[0]?.key).toBe('hello');
    expect(all[0]?.valueJson).toBe('"world"');
  });
});
