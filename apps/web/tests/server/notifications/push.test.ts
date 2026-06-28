import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { insertUser } from '@/server/db/users';
import { cloudSettings } from '@/server/db/settings/cloud';
import { upsertPushDevice } from '@/server/db/mobile-push-devices';
import { sendPush } from '@/server/notifications/push';
import type { NotificationsConfig } from '@/server/db/settings/notifications';

const PUSH_ON_CFG: NotificationsConfig = {
  discordWebhookUrl: null,
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
};

type FetchArgs = Parameters<typeof fetch>;

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  h.cleanup();
});

describe('sendPush', () => {
  it('no-ops when cloud is disabled (default)', async () => {
    const fetchSpy = vi.fn<(...args: FetchArgs) => Promise<Response>>(
      async () => new Response('{}', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    // cloudSettings.get() runs inside sendPush and writes the default
    // (enabled=false) row on first read; sendPush must short-circuit
    // without ever calling fetch.
    await sendPush({ kind: 'test' }, [1], PUSH_ON_CFG);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('calls cloud /v1/push when devices exist and cloud is enabled', async () => {
    const user = await insertUser({
      username: 'push-target',
      passwordHash: 'h',
      role: 'user',
      mustChangePassword: false,
    });
    await upsertPushDevice({
      userId: user.id,
      deviceToken: 'tok-1',
      platform: 'ios',
      snsEndpointArn: 'arn:1',
    });
    await cloudSettings.set({
      enabled: true,
      tenantId: 'tnt-1',
      accessToken: 'cached',
      accessTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    const fetchSpy = vi.fn<(...args: FetchArgs) => Promise<Response>>(
      async () =>
        new Response(
          JSON.stringify({
            results: [{ device_token: 'tok-1', status: 'delivered', message_id: 'm-1' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetchSpy);

    await sendPush({ kind: 'test' }, [user.id], PUSH_ON_CFG);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const call = fetchSpy.mock.calls[0]!;
    expect(String(call[0])).toMatch(/\/v1\/push$/);
    const init = call[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer cached');
    const body = JSON.parse(init.body as string);
    expect(body.device_tokens).toEqual(['tok-1']);
    expect(body.payload.title).toBe('bookkeeprr notification test');
    expect(body.payload.data).toEqual({ kind: 'test' });
  });
});
