import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';
import { queryAuditEvents } from '@/server/db/audit';

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

async function flushAuditWrite(): Promise<void> {
  await new Promise((r) => setImmediate(r));
}

describe('Settings routes emit settings.update audit events', () => {
  let h: SeedHandle;
  beforeEach(async () => {
    h = await seedDb({ skipDefaultSeries: true });
  });
  afterEach(() => h.cleanup());

  it('PATCH /api/settings/notifications emits settings.update', async () => {
    const cookie = await adminCookie();
    const { PATCH } = await import('@/app/api/settings/notifications/route');
    const res = await PATCH(
      new Request('http://localhost/api/settings/notifications', {
        method: 'PATCH',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          discordWebhookUrl: null,
          discordUsername: 'bk',
          discordAvatarUrl: null,
          appriseUrl: 'http://x',
          eventGrabSuccess: true,
          eventImportSuccess: true,
          eventFailure: true,
          eventUpdateAvailable: false,
        }),
      }),
    );
    expect(res.ok).toBe(true);
    await flushAuditWrite();
    const { rows } = await queryAuditEvents(
      { action: 'settings.update' },
      { limit: 10, offset: 0 },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.targetKind).toBe('settings');
    expect(rows[0]?.targetId).toBe('notifications');
    const meta = JSON.parse(rows[0]!.metadataJson!);
    expect(meta.changedFields).toContain('appriseUrl');
  });

  it('PUT /api/settings/qbt emits settings.update', async () => {
    const cookie = await adminCookie();
    const { PUT } = await import('@/app/api/settings/qbt/route');
    const res = await PUT(
      new Request('http://localhost/api/settings/qbt', {
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          host: 'qbt',
          port: 8080,
          username: 'user',
          password: 'pwd',
          useHttps: false,
        }),
      }),
    );
    expect(res.ok).toBe(true);
    await flushAuditWrite();
    const { rows } = await queryAuditEvents(
      { action: 'settings.update' },
      { limit: 10, offset: 0 },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.targetId).toBe('qbt');
  });

  it('PATCH /api/auth/oidc/config emits settings.update', async () => {
    const cookie = await adminCookie();
    const { PATCH } = await import('@/app/api/auth/oidc/config/route');
    const res = await PATCH(
      new Request('http://localhost/api/auth/oidc/config', {
        method: 'PATCH',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ buttonLabel: 'Sign in with NewIdP' }),
      }),
    );
    expect(res.ok).toBe(true);
    await flushAuditWrite();
    const { rows } = await queryAuditEvents(
      { action: 'settings.update' },
      { limit: 10, offset: 0 },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.targetId).toBe('oidc-config');
  });
});
