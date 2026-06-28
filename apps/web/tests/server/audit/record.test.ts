import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { recordAuditEvent } from '@/server/audit/record';
import { queryAuditEvents } from '@/server/db/audit';
import * as auditDal from '@/server/db/audit';
import * as loggerModule from '@/server/logger';
import { insertUser } from '@/server/db/users';

describe('recordAuditEvent', () => {
  let h: SeedHandle;
  beforeEach(async () => {
    h = await seedDb({ skipDefaultSeries: true });
    vi.restoreAllMocks();
  });
  afterEach(() => h.cleanup());

  it('writes a user-actor row', async () => {
    const user = await insertUser({
      username: 'admin',
      passwordHash: 'fake',
      role: 'admin',
      mustChangePassword: false,
    });
    await recordAuditEvent({
      actor: { kind: 'user', userId: user.id, username: 'admin' },
      action: 'settings.update',
      target: { kind: 'settings', id: 'notifications' },
      metadata: { changedFields: ['appriseUrl'] },
      context: { peerIp: '10.0.0.1', clientIp: '203.0.113.5', userAgent: 'browser' },
    });
    const { rows } = await queryAuditEvents({}, { limit: 10, offset: 0 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.actorKind).toBe('user');
    expect(rows[0]?.actorUserId).toBe(user.id);
    expect(rows[0]?.actorUsername).toBe('admin');
    expect(rows[0]?.action).toBe('settings.update');
    expect(rows[0]?.targetKind).toBe('settings');
    expect(rows[0]?.targetId).toBe('notifications');
    expect(rows[0]?.metadataJson).toBe('{"changedFields":["appriseUrl"]}');
  });

  it('writes a system-actor row with null actorUserId/Username', async () => {
    await recordAuditEvent({
      actor: { kind: 'system' },
      action: 'auth.oidc_role_recompute',
      metadata: { oldRole: 'admin', newRole: 'user' },
    });
    const { rows } = await queryAuditEvents({}, { limit: 10, offset: 0 });
    expect(rows[0]?.actorKind).toBe('system');
    expect(rows[0]?.actorUserId).toBe(null);
    expect(rows[0]?.actorUsername).toBe(null);
  });

  it('writes an anonymous-actor row with null actorUserId/Username', async () => {
    await recordAuditEvent({
      actor: { kind: 'anonymous' },
      action: 'auth.login_failure',
      metadata: { reason: 'bad_password', attemptedUsername: 'admin' },
    });
    const { rows } = await queryAuditEvents({}, { limit: 10, offset: 0 });
    expect(rows[0]?.actorKind).toBe('anonymous');
    expect(rows[0]?.actorUserId).toBe(null);
    expect(rows[0]?.actorUsername).toBe(null);
  });

  it('swallows DB errors and emits a pino error', async () => {
    const errorSpy = vi.fn();
    const childSpy = vi.fn().mockReturnValue({ error: errorSpy, info: vi.fn(), warn: vi.fn() });
    vi.spyOn(loggerModule, 'logger').mockReturnValue({ child: childSpy } as never);
    vi.spyOn(auditDal, 'insertAuditEvent').mockRejectedValue(new Error('disk full'));

    await expect(
      recordAuditEvent({
        actor: { kind: 'system' },
        action: 'settings.update',
      }),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'settings.update' }),
      'audit write failed',
    );
  });

  it('accepts no target / metadata / context', async () => {
    await recordAuditEvent({
      actor: { kind: 'system' },
      action: 'auth.logout',
    });
    const { rows } = await queryAuditEvents({}, { limit: 10, offset: 0 });
    expect(rows[0]?.targetKind).toBe(null);
    expect(rows[0]?.targetId).toBe(null);
    expect(rows[0]?.metadataJson).toBe(null);
    expect(rows[0]?.peerIp).toBe(null);
  });
});
