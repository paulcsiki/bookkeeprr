import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { notificationsSetting } from '@/server/db/settings/notifications';
import {
  __setDiscordFetcherForTests,
  __resetDiscordForTests,
} from '@/server/notifications/discord';
import { qbtConnectionSetting } from '@/server/db/settings/qbt';
import { __setQbtFetcherForTests, __resetQbtForTests } from '@/server/integrations/qbittorrent';
import { upsertReleaseByGuid } from '@/server/db/releases';
import { grabRelease } from '@/server/grabber';

let h: SeedHandle;
let releaseId: number;

beforeEach(async () => {
  h = await seedDb();
  __resetDiscordForTests();
  __resetQbtForTests();
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
  await qbtConnectionSetting.set({
    host: 'localhost',
    port: 8080,
    username: 'u',
    password: 'p',
    useHttps: false,
  });
  releaseId = await upsertReleaseByGuid({
    indexerId: h.indexerId,
    indexerGuid: 'g',
    seriesId: h.seriesId,
    title: '[LH] Test Series v01',
    link: 'magnet:?xt=urn:btih:' + 'a'.repeat(40),
    targetKind: 'volume',
    targetLow: 1,
    targetHigh: 1,
    groupName: 'LH',
    language: 'en',
    sizeBytes: 100 * 1024 * 1024,
    seeders: 5,
    leechers: 0,
    publishedAt: new Date(),
    score: 0.9,
  });
});
afterEach(() => {
  __resetDiscordForTests();
  __resetQbtForTests();
  h.cleanup();
});

describe('grabber fires notifications', () => {
  it('fires grab-success notification when qBT accepts the torrent', async () => {
    let discordCalls = 0;
    let capturedPayload = '';
    __setDiscordFetcherForTests(async (_url, init) => {
      discordCalls++;
      capturedPayload = String((init as RequestInit).body);
      return { ok: true, status: 204, text: async () => '' };
    });
    __setQbtFetcherForTests(async (url) => {
      if (url.endsWith('/api/v2/auth/login')) {
        return {
          ok: true,
          status: 200,
          headers: { 'set-cookie': 'SID=x' },
          text: async () => 'Ok.',
        };
      }
      if (url.endsWith('/torrents/add')) {
        return { ok: true, status: 200, headers: {}, text: async () => 'Ok.' };
      }
      if (url.includes('/torrents/info')) {
        return {
          ok: true,
          status: 200,
          headers: {},
          text: async () =>
            JSON.stringify([
              {
                hash: 'a'.repeat(40),
                name: 'Test',
                progress: 0,
                state: 'queuedDL',
                save_path: '/media/downloads/incomplete',
                category: 'bookkeeprr-manga',
                tags: '',
                size: 100 * 1024 * 1024,
                completed: 0,
              },
            ]),
        };
      }
      throw new Error(`unexpected ${url}`);
    });

    const result = await grabRelease(releaseId);
    expect(result.ok).toBe(true);
    expect(discordCalls).toBe(1);
    const payload = JSON.parse(capturedPayload);
    // Rich embed: title is the series; "Grabbed" is the description event label.
    expect(payload.embeds[0].description).toContain('Grabbed');
  });
});
