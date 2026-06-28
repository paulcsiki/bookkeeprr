import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'bk-mig-'));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('migration 0002 (content-type)', () => {
  it('full migration chain produces a schema where series.content_type defaults to manga', async () => {
    const dbPath = join(tmp, 'test.db');
    const sqlite = new Database(dbPath);
    const db = drizzle(sqlite);
    migrate(db, { migrationsFolder: './drizzle' });

    // Insert a row without specifying content_type — DEFAULT fills it
    sqlite.exec(`
      INSERT INTO quality_profiles (name, preferred_groups_json, preferred_languages_json)
      VALUES ('default', '[]', '["en"]')
    `);
    sqlite.exec(`
      INSERT INTO series (anilist_id, status, root_path, quality_profile_id, added_at, updated_at)
      VALUES (1, 'releasing', '/x', 1, ${Date.now()}, ${Date.now()})
    `);
    const row = sqlite.prepare(`SELECT content_type FROM series WHERE anilist_id = 1`).get() as {
      content_type: string;
    };
    expect(row.content_type).toBe('manga');
    sqlite.close();
  });

  it('allows anilist_id to be null', async () => {
    const dbPath = join(tmp, 'test.db');
    const sqlite = new Database(dbPath);
    const db = drizzle(sqlite);
    migrate(db, { migrationsFolder: './drizzle' });

    sqlite.exec(`
      INSERT INTO quality_profiles (name, preferred_groups_json, preferred_languages_json)
      VALUES ('default', '[]', '["en"]')
    `);
    sqlite.exec(`
      INSERT INTO series (content_type, status, root_path, quality_profile_id, added_at, updated_at)
      VALUES ('ebook', 'finished', '/y', 1, ${Date.now()}, ${Date.now()})
    `);
    const row = sqlite.prepare(`SELECT anilist_id, content_type FROM series`).get() as {
      anilist_id: number | null;
      content_type: string;
    };
    expect(row.anilist_id).toBeNull();
    expect(row.content_type).toBe('ebook');
    sqlite.close();
  });

  it('UNIQUE index on anilist_id allows multiple nulls', async () => {
    const dbPath = join(tmp, 'test.db');
    const sqlite = new Database(dbPath);
    const db = drizzle(sqlite);
    migrate(db, { migrationsFolder: './drizzle' });

    sqlite.exec(`
      INSERT INTO quality_profiles (name, preferred_groups_json, preferred_languages_json)
      VALUES ('default', '[]', '["en"]')
    `);
    // Two ebook series with anilist_id = null — should both succeed
    sqlite.exec(`
      INSERT INTO series (content_type, anilist_id, status, root_path, quality_profile_id, added_at, updated_at)
      VALUES ('ebook', NULL, 'finished', '/a', 1, ${Date.now()}, ${Date.now()}),
             ('ebook', NULL, 'finished', '/b', 1, ${Date.now()}, ${Date.now()})
    `);
    const count = (
      sqlite.prepare(`SELECT COUNT(*) as n FROM series WHERE anilist_id IS NULL`).get() as {
        n: number;
      }
    ).n;
    expect(count).toBe(2);
    sqlite.close();
  });

  it('UNIQUE index still rejects duplicate non-null anilist_id', async () => {
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
      VALUES (42, 'releasing', '/x', 1, ${Date.now()}, ${Date.now()})
    `);
    expect(() =>
      sqlite.exec(`
        INSERT INTO series (anilist_id, status, root_path, quality_profile_id, added_at, updated_at)
        VALUES (42, 'releasing', '/y', 1, ${Date.now()}, ${Date.now()})
      `),
    ).toThrow();
    sqlite.close();
  });
});

// Hint to silence linter for unused import
void sql;
