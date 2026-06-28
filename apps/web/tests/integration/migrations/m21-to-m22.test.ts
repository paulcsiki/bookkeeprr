import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { sql } from 'drizzle-orm';

const FIXTURE_FOLDER = './tests/integration/migrations/fixtures/drizzle-pre-m22';
const REAL_FOLDER = './drizzle';

function withTmpDb(): { db: ReturnType<typeof drizzle>; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'bk-m21-to-m22-'));
  const sqlite = new Database(join(dir, 'bookkeeprr.db'));
  const db = drizzle(sqlite);
  return {
    db,
    cleanup: () => {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

describe('M21 → M22 migration', () => {
  it('widens users.auth_source enum without dropping rows', () => {
    const { db, cleanup } = withTmpDb();
    try {
      migrate(db, { migrationsFolder: FIXTURE_FOLDER });

      db.run(sql`
        INSERT INTO users
          (username, password_hash, role, must_change_password, disabled,
           auth_source, oidc_issuer, oidc_subject, email, created_at, updated_at)
        VALUES
          ('preserved', 'argon2id$abc', 'admin', 0, 0,
           'local', NULL, NULL, NULL, 1700000000000, 1700000000000)
      `);

      migrate(db, { migrationsFolder: REAL_FOLDER });

      const rows = db.all<{ username: string; auth_source: string; password_hash: string | null }>(
        sql`SELECT username, auth_source, password_hash FROM users`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.username).toBe('preserved');
      expect(rows[0]?.auth_source).toBe('local');
      expect(rows[0]?.password_hash).toBe('argon2id$abc');

      db.run(sql`
        INSERT INTO users
          (username, password_hash, role, must_change_password, disabled,
           auth_source, oidc_issuer, oidc_subject, email, created_at, updated_at)
        VALUES
          ('forwarder', NULL, 'user', 0, 0,
           'forward_auth', NULL, NULL, 'forwarder@example.com',
           1700000000000, 1700000000000)
      `);
      const after = db.all<{ username: string; auth_source: string }>(
        sql`SELECT username, auth_source FROM users WHERE username = 'forwarder'`,
      );
      expect(after).toHaveLength(1);
      expect(after[0]?.auth_source).toBe('forward_auth');
    } finally {
      cleanup();
    }
  });
});
