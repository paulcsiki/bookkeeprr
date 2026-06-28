import { describe, it, expect } from 'vitest';
import {
  provisionExternalUser,
  type ExternalAuthClaims,
  type ExternalProvisionPolicy,
} from '@/server/auth/external-provision';
import type { UserRow } from '@/server/db/schema';

const basePolicy: ExternalProvisionPolicy = {
  allowedGroups: ['bookkeeprr-users'],
  adminGroups: ['bookkeeprr-admins'],
  autoCreateUsers: true,
};

const baseClaims: ExternalAuthClaims = {
  source: 'oidc',
  username: 'alice',
  email: 'alice@example.com',
  groups: ['bookkeeprr-users'],
  oidcIssuer: 'https://idp.example.com/',
  oidcSubject: 'oidc|alice',
};

function mkUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 1,
    username: 'alice',
    passwordHash: null,
    role: 'user',
    mustChangePassword: false,
    disabled: false,
    authSource: 'oidc',
    oidcIssuer: 'https://idp.example.com/',
    oidcSubject: 'oidc|alice',
    email: 'alice@example.com',
    displayName: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: null,
    lastSeenChangelogVersion: null,
    avatarPath: null,
    totpSecretEncrypted: null,
    totpEnabledAt: null,
    totpRecoveryCodesHashed: null,
    ...overrides,
  };
}

describe('provisionExternalUser()', () => {
  describe('first-time login', () => {
    it('auto-creates a regular user when in allowedGroups', () => {
      const r = provisionExternalUser(baseClaims, {
        policy: basePolicy,
        existingUser: null,
        usernameCollision: null,
        activeAdminCount: 1,
      });
      expect(r.kind).toBe('create');
      if (r.kind !== 'create') throw new Error();
      expect(r.insert.role).toBe('user');
      expect(r.insert.username).toBe('alice');
      expect(r.insert.email).toBe('alice@example.com');
      expect(r.insert.oidcIssuer).toBe('https://idp.example.com/');
      expect(r.insert.oidcSubject).toBe('oidc|alice');
    });

    it('auto-creates an admin when in adminGroups', () => {
      const r = provisionExternalUser(
        { ...baseClaims, groups: ['bookkeeprr-users', 'bookkeeprr-admins'] },
        { policy: basePolicy, existingUser: null, usernameCollision: null, activeAdminCount: 1 },
      );
      expect(r.kind).toBe('create');
      if (r.kind !== 'create') throw new Error();
      expect(r.insert.role).toBe('admin');
    });

    it('denies no_allowed_group when groups intersection empty', () => {
      const r = provisionExternalUser(
        { ...baseClaims, groups: ['random-group'] },
        { policy: basePolicy, existingUser: null, usernameCollision: null, activeAdminCount: 1 },
      );
      expect(r).toEqual({ kind: 'denied', reason: 'no_allowed_group' });
    });

    it('allows any token when allowedGroups is empty', () => {
      const r = provisionExternalUser(
        { ...baseClaims, groups: [] },
        {
          policy: { ...basePolicy, allowedGroups: [] },
          existingUser: null,
          usernameCollision: null,
          activeAdminCount: 1,
        },
      );
      expect(r.kind).toBe('create');
    });

    it('denies auto_create_disabled when no existing user and autoCreateUsers=false', () => {
      const r = provisionExternalUser(baseClaims, {
        policy: { ...basePolicy, autoCreateUsers: false },
        existingUser: null,
        usernameCollision: null,
        activeAdminCount: 1,
      });
      expect(r).toEqual({ kind: 'denied', reason: 'auto_create_disabled' });
    });

    it('denies username_conflict when local user owns the username', () => {
      const r = provisionExternalUser(baseClaims, {
        policy: basePolicy,
        existingUser: null,
        usernameCollision: mkUser({ id: 99, authSource: 'local' }),
        activeAdminCount: 1,
      });
      expect(r).toEqual({ kind: 'denied', reason: 'username_conflict' });
    });
  });

  describe('returning user', () => {
    it('login_existing with role unchanged', () => {
      const r = provisionExternalUser(baseClaims, {
        policy: basePolicy,
        existingUser: mkUser({ role: 'user' }),
        usernameCollision: null,
        activeAdminCount: 1,
      });
      expect(r).toEqual({ kind: 'login_existing', userId: 1, newRole: 'user', roleChanged: false });
    });

    it('recomputes role user → admin', () => {
      const r = provisionExternalUser(
        { ...baseClaims, groups: ['bookkeeprr-users', 'bookkeeprr-admins'] },
        {
          policy: basePolicy,
          existingUser: mkUser({ role: 'user' }),
          usernameCollision: null,
          activeAdminCount: 1,
        },
      );
      expect(r).toEqual({ kind: 'login_existing', userId: 1, newRole: 'admin', roleChanged: true });
    });

    it('recomputes role admin → user when activeAdminCount > 1', () => {
      const r = provisionExternalUser(baseClaims, {
        policy: basePolicy,
        existingUser: mkUser({ role: 'admin' }),
        usernameCollision: null,
        activeAdminCount: 2,
      });
      expect(r).toEqual({ kind: 'login_existing', userId: 1, newRole: 'user', roleChanged: true });
    });

    it('last-admin guard prevents demotion', () => {
      const r = provisionExternalUser(baseClaims, {
        policy: basePolicy,
        existingUser: mkUser({ role: 'admin' }),
        usernameCollision: null,
        activeAdminCount: 1,
      });
      expect(r).toEqual({
        kind: 'login_existing',
        userId: 1,
        newRole: 'admin',
        roleChanged: false,
      });
    });

    it('promotion is always allowed (no last-admin involvement)', () => {
      const r = provisionExternalUser(
        { ...baseClaims, groups: ['bookkeeprr-users', 'bookkeeprr-admins'] },
        {
          policy: basePolicy,
          existingUser: mkUser({ role: 'user' }),
          usernameCollision: null,
          activeAdminCount: 0,
        },
      );
      expect(r).toEqual({ kind: 'login_existing', userId: 1, newRole: 'admin', roleChanged: true });
    });

    it('empty adminGroups never confers admin', () => {
      const r = provisionExternalUser(
        { ...baseClaims, groups: ['bookkeeprr-users', 'bookkeeprr-admins'] },
        {
          policy: { ...basePolicy, adminGroups: [] },
          existingUser: mkUser({ role: 'user' }),
          usernameCollision: null,
          activeAdminCount: 1,
        },
      );
      expect(r).toEqual({ kind: 'login_existing', userId: 1, newRole: 'user', roleChanged: false });
    });
  });
});
