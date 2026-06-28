import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { expectShape } from '../../helpers/assert-spec';
import { NotificationsTestResponse } from '@/server/openapi/schemas/settings';
import { POST } from '@/app/api/settings/notifications/test/route';
import { notificationsSetting } from '@/server/db/settings/notifications';
import {
  __setDiscordFetcherForTests,
  __resetDiscordForTests,
} from '@/server/notifications/discord';
import {
  __setAppriseFetcherForTests,
  __resetAppriseForTests,
} from '@/server/notifications/apprise';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  __resetDiscordForTests();
  __resetAppriseForTests();
});
afterEach(() => {
  __resetDiscordForTests();
  __resetAppriseForTests();
  h.cleanup();
});

describe('POST /api/settings/notifications/test', () => {
  it('returns not-configured when nothing is set up', async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    await expectShape(NotificationsTestResponse, res, 'POST /api/settings/notifications/test');
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.discord).toBe('not-configured');
    expect(body.apprise).toBe('not-configured');
  });

  it('returns ok for both configured + successful transports', async () => {
    await notificationsSetting.set({
      discordWebhookUrl: 'https://d/x',
      discordUsername: 'bk',
      discordAvatarUrl: null,
      appriseUrl: 'http://a/x',
      eventGrabSuccess: true,
      eventImportSuccess: true,
      eventFailure: true,
      eventUpdateAvailable: false,
      pushGrabSuccess: true,
      pushImportSuccess: true,
      pushFailure: true,
      pushUpdateAvailable: true,
    });
    __setDiscordFetcherForTests(async () => ({ ok: true, status: 204, text: async () => '' }));
    __setAppriseFetcherForTests(async () => ({ ok: true, status: 200, text: async () => '' }));

    const res = await POST();
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.discord).toBe('ok');
    expect(body.apprise).toBe('ok');
  });

  it('surfaces the per-transport error message', async () => {
    await notificationsSetting.set({
      discordWebhookUrl: 'https://d/x',
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
    __setDiscordFetcherForTests(async () => ({ ok: false, status: 404, text: async () => '' }));

    const res = await POST();
    await expectShape(
      NotificationsTestResponse,
      res,
      'POST /api/settings/notifications/test (transport error)',
    );
    const body = (await res.json()) as { discord: { error: string } };
    expect(body.discord.error).toMatch(/HTTP 404/);
  });
});
