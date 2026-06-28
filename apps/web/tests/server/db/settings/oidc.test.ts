import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../../integration/helpers/seed';
import { oidcConfigSetting, isOidcConfigured } from '@/server/db/settings/oidc';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

describe('oidcConfigSetting', () => {
  it('returns defaults when no row stored', async () => {
    const cfg = await oidcConfigSetting.get();
    expect(cfg.enabled).toBe(false);
    expect(cfg.issuer).toBe('');
    expect(cfg.clientId).toBe('');
    expect(cfg.clientSecret).toBe('');
    expect(cfg.scopes).toEqual(['openid', 'profile', 'email', 'groups']);
    expect(cfg.buttonLabel).toBe('Sign in with SSO');
    expect(cfg.usernameClaim).toBe('preferred_username');
    expect(cfg.emailClaim).toBe('email');
    expect(cfg.groupsClaim).toBe('groups');
    expect(cfg.allowedGroups).toEqual([]);
    expect(cfg.adminGroups).toEqual([]);
    expect(cfg.autoCreateUsers).toBe(true);
  });

  it('round-trips a fully-populated config', async () => {
    await oidcConfigSetting.set({
      enabled: true,
      issuer: 'https://auth.example.com/',
      clientId: 'bookkeeprr',
      clientSecret: 'super-secret',
      scopes: ['openid', 'profile', 'email', 'groups'],
      buttonLabel: 'Sign in with Authentik',
      usernameClaim: 'preferred_username',
      emailClaim: 'email',
      groupsClaim: 'groups',
      allowedGroups: ['bookkeeprr-users'],
      adminGroups: ['bookkeeprr-admins'],
      autoCreateUsers: true,
    });
    const cfg = await oidcConfigSetting.get();
    expect(cfg.enabled).toBe(true);
    expect(cfg.issuer).toBe('https://auth.example.com/');
    expect(cfg.clientSecret).toBe('super-secret');
    expect(cfg.adminGroups).toEqual(['bookkeeprr-admins']);
  });

  it('isOidcConfigured requires enabled + issuer + clientId + clientSecret', async () => {
    const base = {
      enabled: true,
      issuer: 'https://x',
      clientId: 'c',
      clientSecret: 's',
      scopes: ['openid'],
      buttonLabel: 'Sign in',
      usernameClaim: 'preferred_username',
      emailClaim: 'email',
      groupsClaim: 'groups',
      allowedGroups: [],
      adminGroups: [],
      autoCreateUsers: true,
    };
    expect(isOidcConfigured(base)).toBe(true);
    expect(isOidcConfigured({ ...base, enabled: false })).toBe(false);
    expect(isOidcConfigured({ ...base, issuer: '' })).toBe(false);
    expect(isOidcConfigured({ ...base, clientId: '' })).toBe(false);
    expect(isOidcConfigured({ ...base, clientSecret: '' })).toBe(false);
  });
});
