import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { closeDb, getDb } from '@/server/db/client.js';
import { settings } from '@/server/db/schema.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'bk-mig-'));
  process.env.BOOKKEEPRR_DB_PATH = join(tmp, 'test.db');
});

afterEach(() => {
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

describe('migrations: M1 → M2', () => {
  it('all expected tables exist after migration', async () => {
    const db = getDb();
    migrate(db, { migrationsFolder: './drizzle' });

    const rows = db.$client
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'
         ORDER BY name`,
      )
      .all() as { name: string }[];

    expect(rows.map((r) => r.name)).toEqual([
      'activity_events',
      'audit_events',
      'book_series',
      'book_series_entries',
      'book_series_members',
      'chapter_read',
      'chapters',
      'dashboard_prefs',
      'downloads',
      'indexers',
      'jobs',
      'library_files',
      'library_groups',
      'mobile_exchange_codes',
      'mobile_push_devices',
      'mobile_tokens',
      'personal_api_keys',
      'quality_profiles',
      'reading_goals',
      'reading_progress',
      'reading_stats_daily',
      'release_match_replays',
      'releases',
      'replay_runs',
      'scan_matches',
      'series',
      'sessions',
      'settings',
      'user_notification_preferences',
      'users',
      'volumes',
    ]);
  });

  it('preserves M1 settings rows across migration', async () => {
    const db = getDb();
    migrate(db, { migrationsFolder: './drizzle' });

    await db.insert(settings).values({ key: 'test.key', valueJson: '"v"' });

    closeDb();
    const db2 = getDb();
    migrate(db2, { migrationsFolder: './drizzle' });

    const rows = await db2.select().from(settings);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.key).toBe('test.key');
  });
});
