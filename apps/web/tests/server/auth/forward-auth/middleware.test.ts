import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../../../integration/helpers/seed';
import { tryForwardAuth } from '@/server/auth/forward-auth/middleware';
import { forwardAuthConfigSetting } from '@/server/db/settings/forward-auth';
import { insertUser, insertOidcUser, getUserByUsername, updateUser } from '@/server/db/users';
import { hashPassword } from '@/server/auth/password';

async function configureForwardAuth(
  overrides: Partial<{
    enabled: boolean;
    trustedProxies: string[];
    userHeader: string;
    emailHeader: string;
    groupsHeader: string;
    autoCreateUsers: boolean;
    allowedGroups: string[];
    adminGroups: string[];
  }> = {},
): Promise<void> {
  await forwardAuthConfigSetting.set({
    enabled: true,
    trustedProxies: ['10.0.0.0/8'],
    userHeader: 'Remote-User',
    emailHeader: 'Remote-Email',
    groupsHeader: 'Remote-Groups',
    autoCreateUsers: true,
    allowedGroups: [],
    adminGroups: ['bookkeeprr-admins'],
    ...overrides,
  });
}

function mkReq(headers: Record<string, string>): Request {
  return new Request('http://localhost/', { headers });
}

describe('tryForwardAuth', () => {
  let h: SeedHandle;
  beforeEach(async () => {
    h = await seedDb({ skipDefaultSeries: true });
    vi.restoreAllMocks();
  });
  afterEach(() => h.cleanup());

  it("returns 'not_applicable' when forward-auth is disabled", async () => {
    await forwardAuthConfigSetting.set({
      enabled: false,
      trustedProxies: ['10.0.0.0/8'],
      userHeader: 'Remote-User',
      emailHeader: 'Remote-Email',
      groupsHeader: 'Remote-Groups',
      autoCreateUsers: true,
      allowedGroups: [],
      adminGroups: [],
    });
    const r = await tryForwardAuth(
      mkReq({ 'x-forwarded-for': '10.0.0.1', 'remote-user': 'alice' }),
    );
    expect(r.kind).toBe('not_applicable');
  });

  it("returns 'not_applicable' when peer not in trustedProxies", async () => {
    await configureForwardAuth();
    const r = await tryForwardAuth(
      mkReq({ 'x-forwarded-for': '203.0.113.5', 'remote-user': 'alice' }),
    );
    expect(r.kind).toBe('not_applicable');
  });

  it("returns 'not_applicable' when user header is missing", async () => {
    await configureForwardAuth();
    const r = await tryForwardAuth(mkReq({ 'x-forwarded-for': '10.0.0.1' }));
    expect(r.kind).toBe('not_applicable');
  });

  it('authenticates and auto-creates a new user', async () => {
    await configureForwardAuth();
    const r = await tryForwardAuth(
      mkReq({
        'x-forwarded-for': '10.0.0.1',
        'remote-user': 'alice',
        'remote-email': 'alice@example.com',
        'remote-groups': 'bookkeeprr-users,bookkeeprr-admins',
      }),
    );
    expect(r.kind).toBe('authenticated');
    if (r.kind !== 'authenticated') throw new Error();
    expect(r.role).toBe('admin');
    const created = await getUserByUsername('alice');
    expect(created?.authSource).toBe('forward_auth');
    expect(created?.email).toBe('alice@example.com');
  });

  it('reuses an existing forward-auth user', async () => {
    await configureForwardAuth();
    await tryForwardAuth(
      mkReq({
        'x-forwarded-for': '10.0.0.1',
        'remote-user': 'bob',
        'remote-groups': 'bookkeeprr-users',
      }),
    );
    await configureForwardAuth({ allowedGroups: ['bookkeeprr-users'] });
    const r = await tryForwardAuth(
      mkReq({
        'x-forwarded-for': '10.0.0.5',
        'remote-user': 'bob',
        'remote-groups': 'bookkeeprr-users',
      }),
    );
    expect(r.kind).toBe('authenticated');
  });

  it("denies with reason 'no_allowed_group' when groups don't intersect", async () => {
    await configureForwardAuth({ allowedGroups: ['bookkeeprr-users'] });
    const r = await tryForwardAuth(
      mkReq({
        'x-forwarded-for': '10.0.0.1',
        'remote-user': 'charlie',
        'remote-groups': 'random-team',
      }),
    );
    expect(r.kind).toBe('failure');
    if (r.kind !== 'failure') throw new Error();
    expect(r.reason).toBe('no_allowed_group');
  });

  it("denies with reason 'username_conflict' when a local user owns the username", async () => {
    await configureForwardAuth();
    await insertUser({
      username: 'shared',
      passwordHash: await hashPassword('hunter22'),
      role: 'user',
      mustChangePassword: false,
    });
    const r = await tryForwardAuth(
      mkReq({
        'x-forwarded-for': '10.0.0.1',
        'remote-user': 'shared',
        'remote-groups': '',
      }),
    );
    expect(r.kind).toBe('failure');
    if (r.kind !== 'failure') throw new Error();
    expect(r.reason).toBe('username_conflict');
  });

  it("denies with reason 'username_conflict' when an OIDC user owns the username", async () => {
    await configureForwardAuth();
    await insertOidcUser({
      username: 'oidc-alice',
      role: 'user',
      oidcIssuer: 'https://idp.example.com/',
      oidcSubject: 'oidc|alice',
      email: 'alice@example.com',
    });
    const r = await tryForwardAuth(
      mkReq({
        'x-forwarded-for': '10.0.0.1',
        'remote-user': 'oidc-alice',
      }),
    );
    expect(r.kind).toBe('failure');
    if (r.kind !== 'failure') throw new Error();
    expect(r.reason).toBe('username_conflict');
  });

  it("denies with reason 'auto_create_disabled' when autoCreateUsers is false and user doesn't exist", async () => {
    await configureForwardAuth({ autoCreateUsers: false });
    const r = await tryForwardAuth(
      mkReq({
        'x-forwarded-for': '10.0.0.1',
        'remote-user': 'never-seen',
      }),
    );
    expect(r.kind).toBe('failure');
    if (r.kind !== 'failure') throw new Error();
    expect(r.reason).toBe('auto_create_disabled');
  });

  it("denies with reason 'user_disabled' when the existing user is disabled", async () => {
    await configureForwardAuth();
    await tryForwardAuth(
      mkReq({
        'x-forwarded-for': '10.0.0.1',
        'remote-user': 'dean',
        'remote-groups': 'bookkeeprr-users',
      }),
    );
    const u = await getUserByUsername('dean');
    await updateUser(u!.id, { disabled: true });
    const r = await tryForwardAuth(
      mkReq({
        'x-forwarded-for': '10.0.0.1',
        'remote-user': 'dean',
        'remote-groups': 'bookkeeprr-users',
      }),
    );
    expect(r.kind).toBe('failure');
    if (r.kind !== 'failure') throw new Error();
    expect(r.reason).toBe('user_disabled');
  });
});
