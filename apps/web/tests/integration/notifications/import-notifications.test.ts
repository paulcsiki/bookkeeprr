import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { notificationsSetting } from '@/server/db/settings/notifications';
import {
  __setDiscordFetcherForTests,
  __resetDiscordForTests,
} from '@/server/notifications/discord';
import { upsertReleaseByGuid } from '@/server/db/releases';
import { insertDownload } from '@/server/db/downloads';
import { insertLibraryFile } from '@/server/db/library-files';
import type * as ImporterModuleType from '@/server/importer';

vi.mock('@/server/importer', async () => {
  const actual = await vi.importActual<typeof ImporterModuleType>('@/server/importer');
  return {
    ...actual,
    importDownload: vi.fn(),
  };
});

import { importDescriptor } from '@/server/jobs/kinds/import';
import * as importerModule from '@/server/importer';

let h: SeedHandle;
let releaseId: number;
let downloadId: number;

beforeEach(async () => {
  h = await seedDb();
  __resetDiscordForTests();
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
  releaseId = await upsertReleaseByGuid({
    indexerId: h.indexerId,
    indexerGuid: 'guid-import-notif',
    seriesId: h.seriesId,
    title: '[Grp] Test Series v01',
    link: 'magnet:?xt=urn:btih:' + 'a'.repeat(40),
    targetKind: 'volume',
    targetLow: 1,
    targetHigh: 1,
    groupName: 'Grp',
    language: 'en',
    sizeBytes: 100,
    publishedAt: new Date(),
  });
  downloadId = await insertDownload({
    releaseId,
    qbtHash: 'a'.repeat(40),
    status: 'completed',
  });
});

afterEach(() => {
  __resetDiscordForTests();
  vi.clearAllMocks();
  h.cleanup();
});

describe('import job notifications', () => {
  it('fires exactly ONE import-success notification for a multi-file import', async () => {
    // Seed two library_files rows that the notifier can look up
    const lf1 = await insertLibraryFile({
      seriesId: h.seriesId,
      volumeId: h.volumeId,
      path: '/media/comics/Test Series/v01.cbz',
      sizeBytes: 1234,
      sourceReleaseId: releaseId,
    });
    const lf2 = await insertLibraryFile({
      seriesId: h.seriesId,
      volumeId: h.volumeId,
      path: '/media/comics/Test Series/v02.cbz',
      sizeBytes: 5678,
      sourceReleaseId: releaseId,
    });

    vi.mocked(importerModule.importDownload).mockResolvedValue({
      imported: [
        {
          libraryFileId: lf1,
          path: '/media/comics/Test Series/v01.cbz',
          targetKind: 'volume',
          targetNumber: 1,
        },
        {
          libraryFileId: lf2,
          path: '/media/comics/Test Series/v02.cbz',
          targetKind: 'volume',
          targetNumber: 2,
        },
      ],
      skipped: [],
      conflicts: [],
      failed: [],
    });

    let discordCalls = 0;
    const embeds: { title: string; description?: string }[] = [];
    __setDiscordFetcherForTests(async (_url, init) => {
      discordCalls++;
      const body = JSON.parse(String((init as RequestInit).body));
      embeds.push(body.embeds[0]);
      return { ok: true, status: 204, text: async () => '' };
    });

    await importDescriptor.handler({ downloadId }, 1);

    // ONE summary notification, not one-per-file (regression: large packs used
    // to emit a notification per volume).
    expect(discordCalls).toBe(1);
    // Rich embed: title is the series; the event label lives in the description.
    expect(embeds[0]?.description).toContain('Import complete');
  });

  it('fires failure notification when importDownload throws', async () => {
    vi.mocked(importerModule.importDownload).mockRejectedValue(new Error('boom'));

    let discordCalls = 0;
    const embeds: { title: string; description?: string }[] = [];
    __setDiscordFetcherForTests(async (_url, init) => {
      discordCalls++;
      const body = JSON.parse(String((init as RequestInit).body));
      embeds.push(body.embeds[0]);
      return { ok: true, status: 204, text: async () => '' };
    });

    await expect(importDescriptor.handler({ downloadId }, 1)).rejects.toThrow('boom');

    expect(discordCalls).toBe(1);
    // Rich embed: the failure label is in the description, not the title.
    expect(embeds[0]?.description).toContain('Failed during import');
  });

  it('fires no notifications when result.imported is empty', async () => {
    vi.mocked(importerModule.importDownload).mockResolvedValue({
      imported: [],
      skipped: [],
      conflicts: [],
      failed: [],
    });

    let discordCalls = 0;
    __setDiscordFetcherForTests(async () => {
      discordCalls++;
      return { ok: true, status: 204, text: async () => '' };
    });

    await importDescriptor.handler({ downloadId }, 1);

    expect(discordCalls).toBe(0);
  });
});
