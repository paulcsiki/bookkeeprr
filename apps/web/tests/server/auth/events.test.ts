import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  logLoginSuccess,
  logLoginFailure,
  logLogout,
  logPasswordChange,
  hashTokenForLog,
  logOidcLoginSuccess,
  logOidcLoginFailure,
  logOidcRoleRecompute,
  logForwardAuthLoginSuccess,
  logForwardAuthLoginFailure,
  logForwardAuthRoleRecompute,
} from '@/server/auth/events';
import * as loggerModule from '@/server/logger';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { queryAuditEvents } from '@/server/db/audit';
import { insertUser } from '@/server/db/users';

// recordAuditEvent fires-and-forgets via `void`; flush microtasks + the
// next-tick DB write before asserting on the audit table.
async function flushAuditWrite(): Promise<void> {
  await new Promise((r) => setImmediate(r));
}

describe('auth event logging', () => {
  let h: SeedHandle;

  beforeEach(async () => {
    h = await seedDb({ skipDefaultSeries: true });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    h.cleanup();
  });

  it('exports 4 functions + token-hash helper', () => {
    expect(typeof logLoginSuccess).toBe('function');
    expect(typeof logLoginFailure).toBe('function');
    expect(typeof logLogout).toBe('function');
    expect(typeof logPasswordChange).toBe('function');
    expect(typeof hashTokenForLog).toBe('function');
  });

  it('hashTokenForLog returns a 16-char hex string + does not leak the token', () => {
    const h = hashTokenForLog('some-token-here');
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(h).not.toContain('some-token');
  });

  it('logLoginSuccess accepts the documented shape and writes audit row', async () => {
    const user = await insertUser({
      username: 'alice',
      passwordHash: 'h',
      role: 'admin',
      mustChangePassword: false,
    });
    expect(() =>
      logLoginSuccess({
        userId: user.id,
        username: 'alice',
        ipAddress: '1.2.3.4',
        userAgent: 'curl/8',
      }),
    ).not.toThrow();
    await flushAuditWrite();
    const { rows } = await queryAuditEvents({}, { limit: 10, offset: 0 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe('auth.login_success');
    expect(rows[0]?.actorKind).toBe('user');
    expect(rows[0]?.actorUserId).toBe(user.id);
    expect(rows[0]?.actorUsername).toBe('alice');
    expect(rows[0]?.clientIp).toBe('1.2.3.4');
    expect(rows[0]?.userAgent).toBe('curl/8');
  });

  it('logLoginFailure writes anonymous audit row with reason metadata', async () => {
    expect(() =>
      logLoginFailure({
        username: 'alice',
        ipAddress: null,
        reason: 'bad_password',
      }),
    ).not.toThrow();
    await flushAuditWrite();
    const { rows } = await queryAuditEvents({}, { limit: 10, offset: 0 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe('auth.login_failure');
    expect(rows[0]?.actorKind).toBe('anonymous');
    expect(rows[0]?.actorUserId).toBeNull();
    expect(rows[0]?.actorUsername).toBeNull();
    expect(JSON.parse(rows[0]!.metadataJson!)).toEqual({
      reason: 'bad_password',
      attemptedUsername: 'alice',
    });
  });

  it('logLogout writes audit row with session-hash target', async () => {
    const user = await insertUser({
      username: 'alice',
      passwordHash: 'h',
      role: 'user',
      mustChangePassword: false,
    });
    expect(() =>
      logLogout({ userId: user.id, username: 'alice', sessionToken: 'abc-token' }),
    ).not.toThrow();
    await flushAuditWrite();
    const { rows } = await queryAuditEvents({}, { limit: 10, offset: 0 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe('auth.logout');
    expect(rows[0]?.actorKind).toBe('user');
    expect(rows[0]?.actorUserId).toBe(user.id);
    expect(rows[0]?.actorUsername).toBe('alice');
    expect(rows[0]?.targetKind).toBe('session');
    expect(rows[0]?.targetId).toBe(hashTokenForLog('abc-token'));
  });

  it('logPasswordChange writes audit row keyed to the byUser actor', async () => {
    const admin = await insertUser({
      username: 'admin',
      passwordHash: 'h',
      role: 'admin',
      mustChangePassword: false,
    });
    const target = await insertUser({
      username: 'bob',
      passwordHash: 'h',
      role: 'user',
      mustChangePassword: false,
    });
    expect(() =>
      logPasswordChange({
        userId: target.id,
        username: 'bob',
        byUserId: admin.id,
        byUsername: 'admin',
        forced: true,
      }),
    ).not.toThrow();
    await flushAuditWrite();
    const { rows } = await queryAuditEvents({}, { limit: 10, offset: 0 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe('auth.password_change');
    expect(rows[0]?.actorKind).toBe('user');
    expect(rows[0]?.actorUserId).toBe(admin.id);
    expect(rows[0]?.actorUsername).toBe('admin');
    expect(rows[0]?.targetKind).toBe('user');
    expect(rows[0]?.targetId).toBe(String(target.id));
    expect(JSON.parse(rows[0]!.metadataJson!)).toEqual({
      targetUsername: 'bob',
      forced: true,
    });
  });

  describe('OIDC event shapes', () => {
    it('logOidcLoginSuccess emits info-level event with expected fields + audit row', async () => {
      const user = await insertUser({
        username: 'alice',
        passwordHash: 'h',
        role: 'user',
        mustChangePassword: false,
      });
      const infoSpy = vi.fn();
      const errorSpy = vi.fn();
      const childSpy = vi.fn().mockReturnValue({ info: infoSpy, warn: vi.fn(), error: errorSpy });
      vi.spyOn(loggerModule, 'logger').mockReturnValue({ child: childSpy } as never);
      logOidcLoginSuccess({
        userId: user.id,
        username: 'alice',
        oidcSubject: 'oidc|alice',
        oidcIssuer: 'https://idp.example.com/',
        ipAddress: '1.2.3.4',
        userAgent: 'ua',
      });
      expect(infoSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'oidc_login_success',
          userId: user.id,
          username: 'alice',
          oidcSubject: 'oidc|alice',
          oidcIssuer: 'https://idp.example.com/',
          ipAddress: '1.2.3.4',
          userAgent: 'ua',
        }),
        'oidc_login_success',
      );
      await flushAuditWrite();
      vi.restoreAllMocks();
      const { rows } = await queryAuditEvents({}, { limit: 10, offset: 0 });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.action).toBe('auth.oidc_login_success');
      expect(rows[0]?.actorKind).toBe('user');
      expect(rows[0]?.actorUserId).toBe(user.id);
      expect(JSON.parse(rows[0]!.metadataJson!)).toEqual({
        oidcSubject: 'oidc|alice',
        oidcIssuer: 'https://idp.example.com/',
      });
      expect(rows[0]?.clientIp).toBe('1.2.3.4');
      expect(rows[0]?.userAgent).toBe('ua');
    });

    it('logOidcLoginFailure emits warn-level event with reason + anonymous audit row', async () => {
      const warnSpy = vi.fn();
      const errorSpy = vi.fn();
      const childSpy = vi.fn().mockReturnValue({ info: vi.fn(), warn: warnSpy, error: errorSpy });
      vi.spyOn(loggerModule, 'logger').mockReturnValue({ child: childSpy } as never);
      logOidcLoginFailure({ reason: 'state_mismatch', ipAddress: '1.2.3.4' });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'oidc_login_failure',
          reason: 'state_mismatch',
          ipAddress: '1.2.3.4',
        }),
        'oidc_login_failure',
      );
      await flushAuditWrite();
      vi.restoreAllMocks();
      const { rows } = await queryAuditEvents({}, { limit: 10, offset: 0 });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.action).toBe('auth.oidc_login_failure');
      expect(rows[0]?.actorKind).toBe('anonymous');
      expect(JSON.parse(rows[0]!.metadataJson!)).toEqual({ reason: 'state_mismatch' });
      expect(rows[0]?.clientIp).toBe('1.2.3.4');
    });

    it('logOidcRoleRecompute emits info-level event + system-actor audit row', async () => {
      const user = await insertUser({
        username: 'alice',
        passwordHash: 'h',
        role: 'admin',
        mustChangePassword: false,
      });
      const infoSpy = vi.fn();
      const errorSpy = vi.fn();
      const childSpy = vi.fn().mockReturnValue({ info: infoSpy, warn: vi.fn(), error: errorSpy });
      vi.spyOn(loggerModule, 'logger').mockReturnValue({ child: childSpy } as never);
      logOidcRoleRecompute({
        userId: user.id,
        oldRole: 'admin',
        newRole: 'user',
        viaGroups: [],
        guardFired: false,
      });
      expect(infoSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'oidc_role_recompute',
          userId: user.id,
          oldRole: 'admin',
          newRole: 'user',
          viaGroups: [],
          guardFired: false,
        }),
        'oidc_role_recompute',
      );
      await flushAuditWrite();
      vi.restoreAllMocks();
      const { rows } = await queryAuditEvents({}, { limit: 10, offset: 0 });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.action).toBe('auth.oidc_role_recompute');
      expect(rows[0]?.actorKind).toBe('system');
      expect(rows[0]?.actorUserId).toBeNull();
      expect(rows[0]?.targetKind).toBe('user');
      expect(rows[0]?.targetId).toBe(String(user.id));
      expect(JSON.parse(rows[0]!.metadataJson!)).toEqual({
        oldRole: 'admin',
        newRole: 'user',
        viaGroups: [],
        guardFired: false,
      });
    });
  });

  describe('forward-auth event shapes', () => {
    it('logForwardAuthLoginSuccess emits info-level event with expected fields + audit row', async () => {
      const user = await insertUser({
        username: 'fwd-alice',
        passwordHash: 'h',
        role: 'user',
        mustChangePassword: false,
      });
      const infoSpy = vi.fn();
      const errorSpy = vi.fn();
      const childSpy = vi.fn().mockReturnValue({ info: infoSpy, warn: vi.fn(), error: errorSpy });
      vi.spyOn(loggerModule, 'logger').mockReturnValue({ child: childSpy } as never);
      logForwardAuthLoginSuccess({
        userId: user.id,
        username: 'fwd-alice',
        peerIp: '192.168.1.10',
        clientIp: '203.0.113.5',
        userAgent: 'ua-string',
      });
      expect(infoSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'forward_auth_login_success',
          userId: user.id,
          username: 'fwd-alice',
          peerIp: '192.168.1.10',
          clientIp: '203.0.113.5',
          userAgent: 'ua-string',
        }),
        'forward_auth_login_success',
      );
      await flushAuditWrite();
      vi.restoreAllMocks();
      const { rows } = await queryAuditEvents({}, { limit: 10, offset: 0 });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.action).toBe('auth.forward_auth_login_success');
      expect(rows[0]?.actorKind).toBe('user');
      expect(rows[0]?.actorUserId).toBe(user.id);
      expect(rows[0]?.peerIp).toBe('192.168.1.10');
      expect(rows[0]?.clientIp).toBe('203.0.113.5');
      expect(rows[0]?.userAgent).toBe('ua-string');
    });

    it('logForwardAuthLoginFailure emits warn-level event with reason + anonymous audit row', async () => {
      const warnSpy = vi.fn();
      const errorSpy = vi.fn();
      const childSpy = vi.fn().mockReturnValue({ info: vi.fn(), warn: warnSpy, error: errorSpy });
      vi.spyOn(loggerModule, 'logger').mockReturnValue({ child: childSpy } as never);
      logForwardAuthLoginFailure({
        reason: 'no_allowed_group',
        peerIp: '192.168.1.10',
        clientIp: '203.0.113.5',
      });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'forward_auth_login_failure',
          reason: 'no_allowed_group',
          peerIp: '192.168.1.10',
          clientIp: '203.0.113.5',
        }),
        'forward_auth_login_failure',
      );
      await flushAuditWrite();
      vi.restoreAllMocks();
      const { rows } = await queryAuditEvents({}, { limit: 10, offset: 0 });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.action).toBe('auth.forward_auth_login_failure');
      expect(rows[0]?.actorKind).toBe('anonymous');
      expect(JSON.parse(rows[0]!.metadataJson!)).toEqual({ reason: 'no_allowed_group' });
      expect(rows[0]?.peerIp).toBe('192.168.1.10');
      expect(rows[0]?.clientIp).toBe('203.0.113.5');
    });

    it('logForwardAuthRoleRecompute emits info-level event + system-actor audit row', async () => {
      const user = await insertUser({
        username: 'fwd-alice',
        passwordHash: 'h',
        role: 'user',
        mustChangePassword: false,
      });
      const infoSpy = vi.fn();
      const errorSpy = vi.fn();
      const childSpy = vi.fn().mockReturnValue({ info: infoSpy, warn: vi.fn(), error: errorSpy });
      vi.spyOn(loggerModule, 'logger').mockReturnValue({ child: childSpy } as never);
      logForwardAuthRoleRecompute({
        userId: user.id,
        oldRole: 'user',
        newRole: 'admin',
        viaGroups: ['bookkeeprr-admins'],
        guardFired: false,
      });
      expect(infoSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'forward_auth_role_recompute',
          userId: user.id,
          oldRole: 'user',
          newRole: 'admin',
          viaGroups: ['bookkeeprr-admins'],
          guardFired: false,
        }),
        'forward_auth_role_recompute',
      );
      await flushAuditWrite();
      vi.restoreAllMocks();
      const { rows } = await queryAuditEvents({}, { limit: 10, offset: 0 });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.action).toBe('auth.forward_auth_role_recompute');
      expect(rows[0]?.actorKind).toBe('system');
      expect(rows[0]?.actorUserId).toBeNull();
      expect(rows[0]?.targetKind).toBe('user');
      expect(rows[0]?.targetId).toBe(String(user.id));
      expect(JSON.parse(rows[0]!.metadataJson!)).toEqual({
        oldRole: 'user',
        newRole: 'admin',
        viaGroups: ['bookkeeprr-admins'],
        guardFired: false,
      });
    });
  });
});
