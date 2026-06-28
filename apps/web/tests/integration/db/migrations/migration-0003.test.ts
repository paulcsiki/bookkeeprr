import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'bk-mig-3-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('migration 0003 (comic columns)', () => {
  it('after migrate, existing manga rows have NULL for new columns', () => {
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
    const row = sqlite
      .prepare(
        `SELECT content_type, comicvine_id, publisher, start_year FROM series WHERE anilist_id = 1`,
      )
      .get() as {
      content_type: string;
      comicvine_id: number | null;
      publisher: string | null;
      start_year: number | null;
    };
    expect(row.content_type).toBe('manga');
    expect(row.comicvine_id).toBeNull();
    expect(row.publisher).toBeNull();
    expect(row.start_year).toBeNull();
    sqlite.close();
  });

  it('inserts a comic row with new fields populated', () => {
    const dbPath = join(tmp, 'test.db');
    const sqlite = new Database(dbPath);
    const db = drizzle(sqlite);
    migrate(db, { migrationsFolder: './drizzle' });

    sqlite.exec(`
      INSERT INTO quality_profiles (name, preferred_groups_json, preferred_languages_json)
      VALUES ('default', '[]', '["en"]')
    `);
    sqlite.exec(`
      INSERT INTO series (content_type, comicvine_id, publisher, start_year, status, root_path, quality_profile_id, granularity, added_at, updated_at)
      VALUES ('comic', 12345, 'DC Comics', 1986, 'finished', '/media/comics/DC Comics/Watchmen (1986)', 1, 'chapter', ${Date.now()}, ${Date.now()})
    `);
    const row = sqlite
      .prepare(
        `SELECT content_type, comicvine_id, publisher, start_year FROM series WHERE comicvine_id = 12345`,
      )
      .get() as {
      content_type: string;
      comicvine_id: number;
      publisher: string;
      start_year: number;
    };
    expect(row).toEqual({
      content_type: 'comic',
      comicvine_id: 12345,
      publisher: 'DC Comics',
      start_year: 1986,
    });
    sqlite.close();
  });

  it('UNIQUE index on comicvine_id rejects duplicates, allows multiple NULLs', () => {
    const dbPath = join(tmp, 'test.db');
    const sqlite = new Database(dbPath);
    const db = drizzle(sqlite);
    migrate(db, { migrationsFolder: './drizzle' });

    sqlite.exec(`
      INSERT INTO quality_profiles (name, preferred_groups_json, preferred_languages_json)
      VALUES ('default', '[]', '["en"]')
    `);
    sqlite.exec(`
      INSERT INTO series (content_type, comicvine_id, status, root_path, quality_profile_id, added_at, updated_at)
      VALUES ('comic', 99, 'releasing', '/x', 1, ${Date.now()}, ${Date.now()}),
             ('manga', NULL, 'releasing', '/y', 1, ${Date.now()}, ${Date.now()}),
             ('manga', NULL, 'releasing', '/z', 1, ${Date.now()}, ${Date.now()})
    `);
    // Duplicate comicvine_id rejected:
    expect(() =>
      sqlite.exec(`
        INSERT INTO series (content_type, comicvine_id, status, root_path, quality_profile_id, added_at, updated_at)
        VALUES ('comic', 99, 'releasing', '/w', 1, ${Date.now()}, ${Date.now()})
      `),
    ).toThrow();
    // Multiple NULLs are fine:
    const count = (
      sqlite.prepare(`SELECT COUNT(*) as n FROM series WHERE comicvine_id IS NULL`).get() as {
        n: number;
      }
    ).n;
    expect(count).toBe(2);
    sqlite.close();
  });
});
