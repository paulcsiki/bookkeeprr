import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { insertUser } from '@/server/db/users';
import { hashPassword } from '@/server/auth/password';
import { issueMobileToken } from '@/server/mobile/tokens';
import { insertAuditEvent } from '@/server/db/audit';
import { oidcConfigSetting } from '@/server/db/settings/oidc';
import { notificationsSetting } from '@/server/db/settings/notifications';
import { GET as authConfigGET } from '@/app/api/mobile/auth/config/route';
import { GET as auditGET } from '@/app/api/mobile/audit/events/route';
import { GET as integrationsGET } from '@/app/api/mobile/integrations/route';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});

afterEach(() => {
  h.cleanup();
});

async function adminToken(): Promise<string> {
  const user = await insertUser({
    username: 'admin',
    passwordHash: await hashPassword('hunter22'),
    role: 'admin',
    mustChangePassword: false,
  });
  const issued = await issueMobileToken(user.id);
  return issued.token;
}

async function userToken(): Promise<string> {
  const user = await insertUser({
    username: 'reggie',
    passwordHash: await hashPassword('hunter22'),
    role: 'user',
    mustChangePassword: false,
  });
  const issued = await issueMobileToken(user.id);
  return issued.token;
}

function mkReq(path: string, bearer?: string): Request {
  const headers: Record<string, string> = {};
  if (bearer !== undefined) headers.authorization = `Bearer ${bearer}`;
  return new Request(`http://localhost${path}`, { method: 'GET', headers });
}

describe('GET /api/mobile/auth/config', () => {
  it('401s without a bearer token', async () => {
    const res = await authConfigGET(mkReq('/api/mobile/auth/config'));
    expect(res.status).toBe(401);
  });

  it('403s for a non-admin bearer token (does NOT 401 → no sign-out)', async () => {
    const res = await authConfigGET(mkReq('/api/mobile/auth/config', await userToken()));
    expect(res.status).toBe(403);
  });

  it('returns the modes summary for an admin bearer token', async () => {
    await oidcConfigSetting.set({
      enabled: true,
      issuer: 'https://idp.example.com',
      clientId: 'cid',
      clientSecret: 'secret',
      scopes: ['openid'],
      buttonLabel: 'SSO',
      usernameClaim: 'preferred_username',
      emailClaim: 'email',
      groupsClaim: 'groups',
      allowedGroups: [],
      adminGroups: [],
      autoCreateUsers: true,
    });
    const res = await authConfigGET(mkReq('/api/mobile/auth/config', await adminToken()));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      modes: Array<{ kind: string; enabled: boolean; summary: string }>;
    };
    const local = body.modes.find((m) => m.kind === 'local');
    const oidc = body.modes.find((m) => m.kind === 'oidc');
    const fwd = body.modes.find((m) => m.kind === 'forward_auth');
    expect(local?.enabled).toBe(true);
    expect(oidc?.enabled).toBe(true);
    expect(oidc?.summary).toBe('https://idp.example.com');
    expect(fwd?.enabled).toBe(false);
  });
});

describe('GET /api/mobile/audit/events', () => {
  it('401s without a bearer token', async () => {
    const res = await auditGET(mkReq('/api/mobile/audit/events'));
    expect(res.status).toBe(401);
  });

  it('403s for a non-admin bearer token', async () => {
    const res = await auditGET(mkReq('/api/mobile/audit/events', await userToken()));
    expect(res.status).toBe(403);
  });

  it('returns flattened rows in the mobile shape', async () => {
    const admin = await insertUser({
      username: 'admin',
      passwordHash: await hashPassword('hunter22'),
      role: 'admin',
      mustChangePassword: false,
    });
    const token = (await issueMobileToken(admin.id)).token;
    await insertAuditEvent({
      actorKind: 'user',
      actorUserId: admin.id,
      actorUsername: 'admin',
      action: 'user.create',
      targetKind: 'user',
      targetId: '42',
      metadata: { changedFields: ['username', 'role'] },
      peerIp: null,
      clientIp: null,
      userAgent: null,
    });
    const res = await auditGET(mkReq('/api/mobile/audit/events?filter=all', token));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      rows: Array<{
        id: number;
        occurredAt: string;
        actor: { userId: number; username: string; role: string } | null;
        verb: string;
        action: string;
        target: string;
        diff: string;
      }>;
      total: number;
    };
    expect(body.total).toBeGreaterThanOrEqual(1);
    const row = body.rows.find((r) => r.action === 'user.create');
    expect(row).toBeDefined();
    expect(row?.verb).toBe('create');
    expect(row?.actor).toMatchObject({ userId: admin.id, username: 'admin', role: 'admin' });
    expect(row?.target).toBe('user:42');
    expect(row?.diff).toBe('username, role');
    expect(typeof row?.occurredAt).toBe('string');
  });

  it('scopes the logins filter to auth.* actions', async () => {
    const token = await adminToken();
    await insertAuditEvent({
      actorKind: 'user',
      actorUserId: null,
      actorUsername: 'admin',
      action: 'auth.login_success',
      targetKind: null,
      targetId: null,
      metadata: null,
      peerIp: null,
      clientIp: null,
      userAgent: null,
    });
    await insertAuditEvent({
      actorKind: 'user',
      actorUserId: null,
      actorUsername: 'admin',
      action: 'series.create',
      targetKind: 'series',
      targetId: '1',
      metadata: null,
      peerIp: null,
      clientIp: null,
      userAgent: null,
    });
    const res = await auditGET(mkReq('/api/mobile/audit/events?filter=logins', token));
    const body = (await res.json()) as { rows: Array<{ action: string }> };
    expect(body.rows.every((r) => r.action.startsWith('auth.'))).toBe(true);
    expect(body.rows.some((r) => r.action === 'auth.login_success')).toBe(true);
  });
});

describe('GET /api/mobile/integrations', () => {
  it('401s without a bearer token', async () => {
    const res = await integrationsGET(mkReq('/api/mobile/integrations'));
    expect(res.status).toBe(401);
  });

  it('403s for a non-admin bearer token', async () => {
    const res = await integrationsGET(mkReq('/api/mobile/integrations', await userToken()));
    expect(res.status).toBe(403);
  });

  it('returns the integrations list with derived status', async () => {
    await notificationsSetting.set({
      discordWebhookUrl: 'https://discord.com/api/webhooks/abc',
      discordUsername: 'bookkeeprr',
      discordAvatarUrl: null,
      appriseUrl: null,
      eventGrabSuccess: true,
      eventImportSuccess: true,
      eventFailure: true,
      eventUpdateAvailable: false,
      pushGrabSuccess: true,
      pushImportSuccess: true,
      pushFailure: true,
      pushUpdateAvailable: true,
    });
    const res = await integrationsGET(mkReq('/api/mobile/integrations', await adminToken()));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      integrations: Array<{ kind: string; enabled: boolean; status: string; meta: string }>;
    };
    const discord = body.integrations.find((i) => i.kind === 'discord');
    const apprise = body.integrations.find((i) => i.kind === 'apprise');
    expect(discord).toMatchObject({ enabled: true, status: 'ok' });
    expect(apprise).toMatchObject({ enabled: false, status: 'disabled' });
  });
});
