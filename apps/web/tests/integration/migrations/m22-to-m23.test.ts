import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { sql } from 'drizzle-orm';

function withTmpDb(): { db: ReturnType<typeof drizzle>; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'bk-m22-to-m23-'));
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

describe('M22 → M23 migration (audit_events table)', () => {
  it('creates audit_events table with the documented columns and indexes', () => {
    const { db, cleanup } = withTmpDb();
    try {
      migrate(db, { migrationsFolder: './drizzle' });

      const cols = db.all<{ name: string; type: string; notnull: number }>(
        sql`PRAGMA table_info(audit_events)`,
      );
      const byName = new Map(cols.map((c) => [c.name, c]));
      expect(byName.get('id')?.notnull).toBe(1);
      expect(byName.get('timestamp')?.notnull).toBe(1);
      expect(byName.get('actor_kind')?.notnull).toBe(1);
      expect(byName.get('action')?.notnull).toBe(1);
      expect(byName.get('actor_user_id')?.notnull).toBe(0);
      expect(byName.get('actor_username')?.notnull).toBe(0);
      expect(byName.get('target_kind')?.notnull).toBe(0);
      expect(byName.get('target_id')?.notnull).toBe(0);
      expect(byName.get('metadata_json')?.notnull).toBe(0);
      expect(byName.get('peer_ip')?.notnull).toBe(0);
      expect(byName.get('client_ip')?.notnull).toBe(0);
      expect(byName.get('user_agent')?.notnull).toBe(0);

      const idx = db.all<{ name: string }>(
        sql`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='audit_events'`,
      );
      const names = new Set(idx.map((r) => r.name));
      expect(names.has('audit_events_timestamp_idx')).toBe(true);
      expect(names.has('audit_events_action_idx')).toBe(true);
      expect(names.has('audit_events_actor_idx')).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('can insert + read an audit_events row', () => {
    const { db, cleanup } = withTmpDb();
    try {
      migrate(db, { migrationsFolder: './drizzle' });
      db.run(sql`
        INSERT INTO users (username, role, created_at, updated_at)
        VALUES ('admin', 'admin', 1700000000000, 1700000000000)
      `);
      db.run(sql`
        INSERT INTO audit_events
          (timestamp, actor_kind, actor_user_id, actor_username, action, target_kind, target_id, metadata_json, peer_ip, client_ip, user_agent)
        VALUES
          (1700000000000, 'user', 1, 'admin', 'auth.login_success', NULL, NULL, NULL, NULL, '203.0.113.5', 'test-ua')
      `);
      const rows = db.all<{ action: string; actor_username: string }>(
        sql`SELECT action, actor_username FROM audit_events`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.action).toBe('auth.login_success');
      expect(rows[0]?.actor_username).toBe('admin');
    } finally {
      cleanup();
    }
  });
});
