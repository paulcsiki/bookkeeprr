import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'bk-mig-4-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('migration 0004 (series.author)', () => {
  it('existing rows acquire NULL author after migrate', () => {
    const dbPath = join(tmp, 'test.db');
    const sqlite = new Database(dbPath);
    const db = drizzle(sqlite);
    migrate(db, { migrationsFolder: './drizzle' });

    sqlite.exec(`
      INSERT INTO quality_profiles (name, preferred_groups_json, preferred_languages_json)
      VALUES ('default', '[]', '["en"]')
    `);
    sqlite.exec(`
      INSERT INTO series (anilist_id, status, root_path, quality_profile_id, added_at, updated_at)
      VALUES (1, 'releasing', '/media/comics/X', 1, ${Date.now()}, ${Date.now()})
    `);
    const row = sqlite.prepare(`SELECT author FROM series WHERE anilist_id = 1`).get() as {
      author: string | null;
    };
    expect(row.author).toBeNull();
    sqlite.close();
  });

  it('insert with author succeeds', () => {
    const dbPath = join(tmp, 'test.db');
    const sqlite = new Database(dbPath);
    const db = drizzle(sqlite);
    migrate(db, { migrationsFolder: './drizzle' });

    sqlite.exec(`
      INSERT INTO quality_profiles (name, preferred_groups_json, preferred_languages_json)
      VALUES ('default', '[]', '["en"]')
    `);
    sqlite.exec(`
      INSERT INTO series (content_type, anilist_id, author, status, root_path, quality_profile_id, added_at, updated_at)
      VALUES ('light_novel', 21355, 'Tappei Nagatsuki', 'releasing', '/media/books/Tappei Nagatsuki/Re:Zero Light Novel', 1, ${Date.now()}, ${Date.now()})
    `);
    const row = sqlite.prepare(`SELECT author FROM series WHERE anilist_id = 21355`).get() as {
      author: string;
    };
    expect(row.author).toBe('Tappei Nagatsuki');
    sqlite.close();
  });
});
