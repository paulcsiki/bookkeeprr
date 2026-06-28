import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { insertAuditEvent, queryAuditEvents, pruneAuditEvents } from '@/server/db/audit';
import { insertUser } from '@/server/db/users';

describe('audit DAL', () => {
  let h: SeedHandle;
  beforeEach(async () => {
    h = await seedDb({ skipDefaultSeries: true });
  });
  afterEach(() => h.cleanup());

  it('insertAuditEvent persists every field', async () => {
    const row = await insertAuditEvent({
      actorKind: 'user',
      actorUserId: null,
      actorUsername: 'admin',
      action: 'auth.login_success',
      targetKind: null,
      targetId: null,
      metadata: { reason: 'ok' },
      peerIp: '10.0.0.1',
      clientIp: '203.0.113.5',
      userAgent: 'curl',
    });
    expect(row.id).toBeGreaterThan(0);
    expect(row.actorKind).toBe('user');
    expect(row.actorUsername).toBe('admin');
    expect(row.action).toBe('auth.login_success');
    expect(row.metadataJson).toBe('{"reason":"ok"}');
    expect(row.peerIp).toBe('10.0.0.1');
    expect(row.clientIp).toBe('203.0.113.5');
    expect(row.userAgent).toBe('curl');
    expect(row.timestamp).toBeInstanceOf(Date);
  });

  it('insertAuditEvent stores null metadata as null (not "null")', async () => {
    const row = await insertAuditEvent({
      actorKind: 'system',
      actorUserId: null,
      actorUsername: null,
      action: 'system.startup',
      targetKind: null,
      targetId: null,
      metadata: null,
      peerIp: null,
      clientIp: null,
      userAgent: null,
    });
    expect(row.metadataJson).toBeNull();
  });

  it('queryAuditEvents returns most recent first', async () => {
    const t1 = new Date('2026-01-01T00:00:00Z');
    const t2 = new Date('2026-01-02T00:00:00Z');
    const t3 = new Date('2026-01-03T00:00:00Z');
    await insertAuditEvent({
      timestamp: t1,
      actorKind: 'system',
      actorUserId: null,
      actorUsername: null,
      action: 'a.one',
      targetKind: null,
      targetId: null,
      metadata: null,
      peerIp: null,
      clientIp: null,
      userAgent: null,
    });
    await insertAuditEvent({
      timestamp: t3,
      actorKind: 'system',
      actorUserId: null,
      actorUsername: null,
      action: 'a.three',
      targetKind: null,
      targetId: null,
      metadata: null,
      peerIp: null,
      clientIp: null,
      userAgent: null,
    });
    await insertAuditEvent({
      timestamp: t2,
      actorKind: 'system',
      actorUserId: null,
      actorUsername: null,
      action: 'a.two',
      targetKind: null,
      targetId: null,
      metadata: null,
      peerIp: null,
      clientIp: null,
      userAgent: null,
    });
    const { rows, total } = await queryAuditEvents({}, { limit: 10, offset: 0 });
    expect(total).toBe(3);
    expect(rows.map((r) => r.action)).toEqual(['a.three', 'a.two', 'a.one']);
  });

  it('queryAuditEvents filters by exact action', async () => {
    await insertAuditEvent({
      actorKind: 'system',
      actorUserId: null,
      actorUsername: null,
      action: 'auth.login_success',
      targetKind: null,
      targetId: null,
      metadata: null,
      peerIp: null,
      clientIp: null,
      userAgent: null,
    });
    await insertAuditEvent({
      actorKind: 'system',
      actorUserId: null,
      actorUsername: null,
      action: 'auth.login_failure',
      targetKind: null,
      targetId: null,
      metadata: null,
      peerIp: null,
      clientIp: null,
      userAgent: null,
    });
    await insertAuditEvent({
      actorKind: 'system',
      actorUserId: null,
      actorUsername: null,
      action: 'series.create',
      targetKind: null,
      targetId: null,
      metadata: null,
      peerIp: null,
      clientIp: null,
      userAgent: null,
    });
    const { rows, total } = await queryAuditEvents(
      { action: 'auth.login_success' },
      { limit: 10, offset: 0 },
    );
    expect(total).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.action).toBe('auth.login_success');
  });

  it('queryAuditEvents filters by actionPrefix', async () => {
    await insertAuditEvent({
      actorKind: 'system',
      actorUserId: null,
      actorUsername: null,
      action: 'auth.login_success',
      targetKind: null,
      targetId: null,
      metadata: null,
      peerIp: null,
      clientIp: null,
      userAgent: null,
    });
    await insertAuditEvent({
      actorKind: 'system',
      actorUserId: null,
      actorUsername: null,
      action: 'auth.logout',
      targetKind: null,
      targetId: null,
      metadata: null,
      peerIp: null,
      clientIp: null,
      userAgent: null,
    });
    await insertAuditEvent({
      actorKind: 'system',
      actorUserId: null,
      actorUsername: null,
      action: 'series.create',
      targetKind: null,
      targetId: null,
      metadata: null,
      peerIp: null,
      clientIp: null,
      userAgent: null,
    });
    const { rows, total } = await queryAuditEvents(
      { actionPrefix: 'auth.' },
      { limit: 10, offset: 0 },
    );
    expect(total).toBe(2);
    expect(rows.map((r) => r.action).sort()).toEqual(['auth.login_success', 'auth.logout']);
  });

  it('queryAuditEvents filters by actorUserId', async () => {
    const u1 = await insertUser({
      username: 'alice',
      passwordHash: 'h',
      role: 'admin',
      mustChangePassword: false,
    });
    const u2 = await insertUser({
      username: 'bob',
      passwordHash: 'h',
      role: 'user',
      mustChangePassword: false,
    });
    await insertAuditEvent({
      actorKind: 'user',
      actorUserId: u1.id,
      actorUsername: 'alice',
      action: 'series.create',
      targetKind: null,
      targetId: null,
      metadata: null,
      peerIp: null,
      clientIp: null,
      userAgent: null,
    });
    await insertAuditEvent({
      actorKind: 'user',
      actorUserId: u2.id,
      actorUsername: 'bob',
      action: 'series.delete',
      targetKind: null,
      targetId: null,
      metadata: null,
      peerIp: null,
      clientIp: null,
      userAgent: null,
    });
    await insertAuditEvent({
      actorKind: 'user',
      actorUserId: u1.id,
      actorUsername: 'alice',
      action: 'series.update',
      targetKind: null,
      targetId: null,
      metadata: null,
      peerIp: null,
      clientIp: null,
      userAgent: null,
    });
    const { rows, total } = await queryAuditEvents(
      { actorUserId: u1.id },
      { limit: 10, offset: 0 },
    );
    expect(total).toBe(2);
    expect(rows.every((r) => r.actorUserId === u1.id)).toBe(true);
  });

  it('queryAuditEvents filters by from/to date range', async () => {
    const old = new Date('2025-01-01T00:00:00Z');
    const mid = new Date('2025-06-01T00:00:00Z');
    const newer = new Date('2026-01-01T00:00:00Z');
    await insertAuditEvent({
      timestamp: old,
      actorKind: 'system',
      actorUserId: null,
      actorUsername: null,
      action: 'a.old',
      targetKind: null,
      targetId: null,
      metadata: null,
      peerIp: null,
      clientIp: null,
      userAgent: null,
    });
    await insertAuditEvent({
      timestamp: mid,
      actorKind: 'system',
      actorUserId: null,
      actorUsername: null,
      action: 'a.mid',
      targetKind: null,
      targetId: null,
      metadata: null,
      peerIp: null,
      clientIp: null,
      userAgent: null,
    });
    await insertAuditEvent({
      timestamp: newer,
      actorKind: 'system',
      actorUserId: null,
      actorUsername: null,
      action: 'a.newer',
      targetKind: null,
      targetId: null,
      metadata: null,
      peerIp: null,
      clientIp: null,
      userAgent: null,
    });
    const { rows, total } = await queryAuditEvents(
      {
        from: new Date('2025-03-01T00:00:00Z'),
        to: new Date('2025-12-31T00:00:00Z'),
      },
      { limit: 10, offset: 0 },
    );
    expect(total).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.action).toBe('a.mid');
  });

  it('queryAuditEvents honours limit + offset', async () => {
    for (let i = 0; i < 5; i++) {
      await insertAuditEvent({
        timestamp: new Date(2026, 0, i + 1),
        actorKind: 'system',
        actorUserId: null,
        actorUsername: null,
        action: `a.${i}`,
        targetKind: null,
        targetId: null,
        metadata: null,
        peerIp: null,
        clientIp: null,
        userAgent: null,
      });
    }
    const { rows, total } = await queryAuditEvents({}, { limit: 2, offset: 1 });
    expect(total).toBe(5);
    expect(rows).toHaveLength(2);
    // ordered DESC by timestamp — newest is a.4, so offset 1 skips it.
    expect(rows.map((r) => r.action)).toEqual(['a.3', 'a.2']);
  });

  it('pruneAuditEvents deletes only rows older than cutoff', async () => {
    const old1 = new Date('2025-01-01T00:00:00Z');
    const old2 = new Date('2025-02-01T00:00:00Z');
    const keep = new Date('2026-01-01T00:00:00Z');
    await insertAuditEvent({
      timestamp: old1,
      actorKind: 'system',
      actorUserId: null,
      actorUsername: null,
      action: 'old.one',
      targetKind: null,
      targetId: null,
      metadata: null,
      peerIp: null,
      clientIp: null,
      userAgent: null,
    });
    await insertAuditEvent({
      timestamp: old2,
      actorKind: 'system',
      actorUserId: null,
      actorUsername: null,
      action: 'old.two',
      targetKind: null,
      targetId: null,
      metadata: null,
      peerIp: null,
      clientIp: null,
      userAgent: null,
    });
    await insertAuditEvent({
      timestamp: keep,
      actorKind: 'system',
      actorUserId: null,
      actorUsername: null,
      action: 'keep.me',
      targetKind: null,
      targetId: null,
      metadata: null,
      peerIp: null,
      clientIp: null,
      userAgent: null,
    });
    const cutoff = new Date('2025-12-31T00:00:00Z');
    const deleted = await pruneAuditEvents(cutoff);
    expect(deleted).toBe(2);
    const { rows, total } = await queryAuditEvents({}, { limit: 10, offset: 0 });
    expect(total).toBe(1);
    expect(rows[0]!.action).toBe('keep.me');
  });
});
