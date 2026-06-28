import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { expectShape } from '../../helpers/assert-spec';
import { ErrorResponse } from '@/server/openapi/schemas/common';
import {
  NotificationsGetResponse,
  SettingsOkResponse,
} from '@/server/openapi/schemas/settings';
import { GET, PATCH } from '@/app/api/settings/notifications/route';
import { notificationsSetting } from '@/server/db/settings/notifications';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

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

function req(method: 'GET' | 'PATCH', cookie: string | null, body?: unknown): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie !== null) headers.cookie = cookie;
  return new Request('http://localhost/api/settings/notifications', {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('GET /api/settings/notifications', () => {
  it('returns defaults with empty URLs', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    await expectShape(NotificationsGetResponse, res, 'GET /api/settings/notifications');
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.discordWebhookUrl).toBe(null);
    expect(body.appriseUrl).toBe(null);
    expect(body.eventGrabSuccess).toBe(true);
  });

  it('masks configured URLs', async () => {
    await notificationsSetting.set({
      discordWebhookUrl: 'https://discord.com/api/webhooks/REAL/SECRET',
      discordUsername: 'bk',
      discordAvatarUrl: null,
      appriseUrl: 'http://apprise:8000/notify/REAL-TOKEN',
      eventGrabSuccess: true,
      eventImportSuccess: true,
      eventFailure: true,
      eventUpdateAvailable: false,
      pushGrabSuccess: true,
      pushImportSuccess: true,
      pushFailure: true,
      pushUpdateAvailable: true,
    });
    const res = await GET();
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.discordWebhookUrl).toBe('••••••••');
    expect(body.appriseUrl).toBe('••••••••');
    expect(body.discordWebhookConfigured).toBe(true);
    expect(body.appriseConfigured).toBe(true);
  });
});

describe('PATCH /api/settings/notifications', () => {
  it('saves a full config', async () => {
    const cookie = await adminCookie();
    const res = await PATCH(
      req('PATCH', cookie, {
        discordWebhookUrl: 'https://discord.com/api/webhooks/x',
        discordUsername: 'bk',
        discordAvatarUrl: null,
        appriseUrl: null,
        eventGrabSuccess: false,
        eventImportSuccess: true,
        eventFailure: true,
        eventUpdateAvailable: false,
      }),
    );
    expect(res.status).toBe(200);
    await expectShape(SettingsOkResponse, res, 'PATCH /api/settings/notifications');
    const cfg = await notificationsSetting.get();
    expect(cfg.discordWebhookUrl).toBe('https://discord.com/api/webhooks/x');
    expect(cfg.eventGrabSuccess).toBe(false);
  });

  it('treats empty string URL as "leave unchanged"', async () => {
    const cookie = await adminCookie();
    await notificationsSetting.set({
      discordWebhookUrl: 'https://discord.com/api/webhooks/original',
      discordUsername: 'bk',
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
    const res = await PATCH(
      req('PATCH', cookie, {
        discordWebhookUrl: '',
        discordUsername: 'renamed',
        discordAvatarUrl: null,
        appriseUrl: null,
        eventGrabSuccess: false,
        eventImportSuccess: true,
        eventFailure: true,
        eventUpdateAvailable: false,
      }),
    );
    expect(res.status).toBe(200);
    const cfg = await notificationsSetting.get();
    expect(cfg.discordWebhookUrl).toBe('https://discord.com/api/webhooks/original');
    expect(cfg.discordUsername).toBe('renamed');
    expect(cfg.eventGrabSuccess).toBe(false);
  });

  it('clears a URL when sent as null', async () => {
    const cookie = await adminCookie();
    await notificationsSetting.set({
      discordWebhookUrl: 'https://discord.com/api/webhooks/original',
      discordUsername: 'bk',
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
    const res = await PATCH(
      req('PATCH', cookie, {
        discordWebhookUrl: null,
        discordUsername: 'bk',
        discordAvatarUrl: null,
        appriseUrl: null,
        eventGrabSuccess: true,
        eventImportSuccess: true,
        eventFailure: true,
        eventUpdateAvailable: false,
      }),
    );
    expect(res.status).toBe(200);
    const cfg = await notificationsSetting.get();
    expect(cfg.discordWebhookUrl).toBeNull();
  });

  it('returns 400 on invalid body', async () => {
    const cookie = await adminCookie();
    const res = await PATCH(req('PATCH', cookie, { eventGrabSuccess: 'not-a-bool' }));
    expect(res.status).toBe(400);
    await expectShape(ErrorResponse, res, 'PATCH /api/settings/notifications (400)');
  });
});
