import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { seedDb, type SeedHandle } from '../../helpers/seed';
import { GET, PATCH } from '@/app/api/auth/forward-auth/config/route';
import { expectShape } from '../../../helpers/assert-spec';
import { ForwardAuthConfigResponse } from '@/server/openapi/schemas/auth';
import {
  forwardAuthConfigSetting,
  type ForwardAuthConfig,
} from '@/server/db/settings/forward-auth';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';

async function adminCookie(): Promise<string> {
  const admin = await insertUser({
    username: 'admin',
    passwordHash: await hashPassword('hunter22'),
    role: 'admin',
    mustChangePassword: false,
  });
  const s = await createSession({ userId: admin.id, userAgent: null, ipAddress: null });
  return `bookkeeprr_session=${s.token}`;
}

async function userCookie(): Promise<string> {
  const u = await insertUser({
    username: 'u',
    passwordHash: await hashPassword('hunter22'),
    role: 'user',
    mustChangePassword: false,
  });
  const s = await createSession({ userId: u.id, userAgent: null, ipAddress: null });
  return `bookkeeprr_session=${s.token}`;
}

describe('GET/PATCH /api/auth/forward-auth/config', () => {
  let h: SeedHandle;
  beforeEach(async () => {
    h = await seedDb({ skipDefaultSeries: true });
  });
  afterEach(() => h.cleanup());

  it('GET: 401 for unauthenticated callers', async () => {
    const res = await GET(new Request('http://localhost/api/auth/forward-auth/config'));
    expect(res.status).toBe(401);
  });

  it('GET: 403 for non-admin users', async () => {
    const cookie = await userCookie();
    const res = await GET(
      new Request('http://localhost/api/auth/forward-auth/config', { headers: { cookie } }),
    );
    expect(res.status).toBe(403);
  });

  it('GET: returns the config verbatim', async () => {
    const cookie = await adminCookie();
    await forwardAuthConfigSetting.set({
      enabled: false,
      trustedProxies: ['10.0.0.0/8'],
      userHeader: 'Remote-User',
      emailHeader: 'Remote-Email',
      groupsHeader: 'Remote-Groups',
      autoCreateUsers: true,
      allowedGroups: [],
      adminGroups: ['bookkeeprr-admins'],
    });
    const res = await GET(
      new Request('http://localhost/api/auth/forward-auth/config', { headers: { cookie } }),
    );
    expect(res.status).toBe(200);
    await expectShape(ForwardAuthConfigResponse, res, 'GET /api/auth/forward-auth/config');
    const body = (await res.json()) as { config: ForwardAuthConfig };
    expect(body.config.trustedProxies).toEqual(['10.0.0.0/8']);
    expect(body.config.adminGroups).toEqual(['bookkeeprr-admins']);
  });

  it('PATCH: 422 with invalid_cidr when trustedProxies contains a bad entry', async () => {
    const cookie = await adminCookie();
    const res = await PATCH(
      new Request('http://localhost/api/auth/forward-auth/config', {
        method: 'PATCH',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ trustedProxies: ['10.0.0.0/8', 'bad-cidr'] }),
      }),
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; invalidCidrs: string[] };
    expect(body.error).toBe('invalid_cidr');
    expect(body.invalidCidrs).toEqual(['bad-cidr']);
  });

  it('PATCH: enabling without satisfying validation returns 422 with diagnostic', async () => {
    const cookie = await adminCookie();
    const res = await PATCH(
      new Request('http://localhost/api/auth/forward-auth/config', {
        method: 'PATCH',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          enabled: true,
          trustedProxies: ['10.0.0.0/8'],
          userHeader: 'Remote-User',
        }),
      }),
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as {
      ready: boolean;
      peerInTrustedProxies: boolean;
      userHeaderPresent: boolean;
    };
    expect(body.ready).toBe(false);
    const stored = await forwardAuthConfigSetting.get();
    expect(stored.enabled).toBe(false);
  });

  it('PATCH: enabling WITH a valid current request succeeds', async () => {
    const cookie = await adminCookie();
    const res = await PATCH(
      new Request('http://localhost/api/auth/forward-auth/config', {
        method: 'PATCH',
        headers: {
          cookie,
          'content-type': 'application/json',
          'x-forwarded-for': '10.0.0.42',
          'remote-user': 'admin',
        },
        body: JSON.stringify({
          enabled: true,
          trustedProxies: ['10.0.0.0/8'],
          userHeader: 'Remote-User',
        }),
      }),
    );
    expect(res.status).toBe(200);
    const stored = await forwardAuthConfigSetting.get();
    expect(stored.enabled).toBe(true);
  });

  it('PATCH: tweaking group lists with enabled already true does not re-validate', async () => {
    const cookie = await adminCookie();
    await forwardAuthConfigSetting.set({
      enabled: true,
      trustedProxies: ['10.0.0.0/8'],
      userHeader: 'Remote-User',
      emailHeader: 'Remote-Email',
      groupsHeader: 'Remote-Groups',
      autoCreateUsers: true,
      allowedGroups: ['existing'],
      adminGroups: [],
    });
    const res = await PATCH(
      new Request('http://localhost/api/auth/forward-auth/config', {
        method: 'PATCH',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ allowedGroups: ['updated'] }),
      }),
    );
    expect(res.status).toBe(200);
    await expectShape(ForwardAuthConfigResponse, res, 'PATCH /api/auth/forward-auth/config');
    const stored = await forwardAuthConfigSetting.get();
    expect(stored.allowedGroups).toEqual(['updated']);
    expect(stored.enabled).toBe(true);
  });

  it('PATCH: disabling forward-auth always succeeds', async () => {
    const cookie = await adminCookie();
    await forwardAuthConfigSetting.set({
      enabled: true,
      trustedProxies: ['10.0.0.0/8'],
      userHeader: 'Remote-User',
      emailHeader: 'Remote-Email',
      groupsHeader: 'Remote-Groups',
      autoCreateUsers: true,
      allowedGroups: [],
      adminGroups: [],
    });
    const res = await PATCH(
      new Request('http://localhost/api/auth/forward-auth/config', {
        method: 'PATCH',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      }),
    );
    expect(res.status).toBe(200);
    const stored = await forwardAuthConfigSetting.get();
    expect(stored.enabled).toBe(false);
  });
});
