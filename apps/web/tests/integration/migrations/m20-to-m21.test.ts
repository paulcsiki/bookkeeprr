import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { closeDb, getDb } from '@/server/db/client.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'bk-mig-m21-'));
  process.env.BOOKKEEPRR_DB_PATH = join(tmp, 'test.db');
});

afterEach(() => {
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

describe('M20 → M21 migration', () => {
  it('users table includes new OIDC columns with correct nullability', () => {
    const db = getDb();
    migrate(db, { migrationsFolder: './drizzle' });

    const cols = db.$client.prepare(`PRAGMA table_info(users)`).all() as Array<{
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
    }>;
    const byName = new Map(cols.map((c) => [c.name, c]));

    expect(byName.get('auth_source')?.notnull).toBe(1);
    expect(byName.get('oidc_issuer')?.notnull).toBe(0);
    expect(byName.get('oidc_subject')?.notnull).toBe(0);
    expect(byName.get('email')?.notnull).toBe(0);
    expect(byName.get('password_hash')?.notnull).toBe(0);
  });

  it('users_oidc_uniq and users_email_idx are present on users', () => {
    const db = getDb();
    migrate(db, { migrationsFolder: './drizzle' });

    const idx = db.$client
      .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='users'`)
      .all() as Array<{ name: string }>;
    const names = new Set(idx.map((r) => r.name));

    expect(names.has('users_oidc_uniq')).toBe(true);
    expect(names.has('users_email_idx')).toBe(true);
  });

  it('preserves existing user rows when 0009 rewrites the users table', () => {
    // Apply migrations through 0008 only (M20 schema shape), insert a row, then
    // apply through 0009. The hand-edited 0009 must preserve the row and default
    // the new columns correctly. If a future `pnpm db:generate` regenerates 0009
    // without preserving the explicit column list in the INSERT…SELECT, this
    // test will fail.
    const db = getDb();
    migrate(db, {
      migrationsFolder: './tests/integration/migrations/fixtures/drizzle-pre-m21',
    });

    const now = Date.now();
    db.$client
      .prepare(
        `INSERT INTO users
         (username, password_hash, role, must_change_password, disabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('alice', 'argon2id$preserved', 'admin', 0, 0, now, now);

    migrate(db, { migrationsFolder: './drizzle' });

    const rows = db.$client
      .prepare(
        `SELECT username, password_hash, auth_source, oidc_issuer, oidc_subject, email
         FROM users WHERE username = ?`,
      )
      .all('alice') as Array<{
      username: string;
      password_hash: string | null;
      auth_source: string;
      oidc_issuer: string | null;
      oidc_subject: string | null;
      email: string | null;
    }>;

    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.password_hash).toBe('argon2id$preserved');
    expect(row.auth_source).toBe('local');
    expect(row.oidc_issuer).toBeNull();
    expect(row.oidc_subject).toBeNull();
    expect(row.email).toBeNull();
  });
});
