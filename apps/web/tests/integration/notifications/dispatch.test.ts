import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { notificationsSetting } from '@/server/db/settings/notifications';
import { notify } from '@/server/notifications';
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

describe('notify()', () => {
  it('fires to both transports when both configured', async () => {
    await notificationsSetting.set({
      discordWebhookUrl: 'https://d/x',
      discordUsername: 'b',
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
    let discordCalls = 0;
    let appriseCalls = 0;
    __setDiscordFetcherForTests(async () => {
      discordCalls++;
      return { ok: true, status: 204, text: async () => '' };
    });
    __setAppriseFetcherForTests(async () => {
      appriseCalls++;
      return { ok: true, status: 200, text: async () => '' };
    });

    await notify({ kind: 'test' });
    expect(discordCalls).toBe(1);
    expect(appriseCalls).toBe(1);
  });

  it('skips when event toggle is off', async () => {
    await notificationsSetting.set({
      discordWebhookUrl: 'https://d/x',
      discordUsername: 'b',
      discordAvatarUrl: null,
      appriseUrl: null,
      eventGrabSuccess: false,
      eventImportSuccess: true,
      eventFailure: true,
      eventUpdateAvailable: false,
      pushGrabSuccess: true,
      pushImportSuccess: true,
      pushFailure: true,
      pushUpdateAvailable: true,
    });
    const fn = vi.fn(async () => ({ ok: true, status: 204, text: async () => '' }));
    __setDiscordFetcherForTests(fn);

    await notify({
      kind: 'grab-success',
      series: { id: 1, titleEnglish: 'X', titleRomaji: null, titleNative: null } as never,
      release: { title: 't', sizeBytes: 1 } as never,
      indexerName: 'nyaa',
    });
    expect(fn).not.toHaveBeenCalled();
  });

  it('continues to second transport when first throws', async () => {
    await notificationsSetting.set({
      discordWebhookUrl: 'https://d/x',
      discordUsername: 'b',
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
    let appriseCalls = 0;
    __setDiscordFetcherForTests(async () => ({ ok: false, status: 500, text: async () => '' }));
    __setAppriseFetcherForTests(async () => {
      appriseCalls++;
      return { ok: true, status: 200, text: async () => '' };
    });

    await expect(notify({ kind: 'test' })).resolves.toBeUndefined();
    expect(appriseCalls).toBe(1);
  });

  it('is a no-op when no transports configured', async () => {
    await expect(notify({ kind: 'test' })).resolves.toBeUndefined();
  });
});
