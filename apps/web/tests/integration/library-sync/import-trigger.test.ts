import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { audiobookshelfSetting } from '@/server/db/settings/audiobookshelf';
import {
  __setAudiobookshelfFetcherForTests,
  __resetAudiobookshelfForTests,
} from '@/server/library-sync/audiobookshelf';
import { __resetDiscordForTests } from '@/server/notifications/discord';
import { __resetAppriseForTests } from '@/server/notifications/apprise';
import { insertDownload } from '@/server/db/downloads';
import { upsertReleaseByGuid } from '@/server/db/releases';
import { getDb } from '@/server/db/client';
import { libraryFiles, series } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import type * as ImporterModuleType from '@/server/importer';

vi.mock('@/server/importer', async () => {
  const actual = await vi.importActual<typeof ImporterModuleType>('@/server/importer');
  return { ...actual, importDownload: vi.fn() };
});

import { importDescriptor } from '@/server/jobs/kinds/import';
import * as importerModule from '@/server/importer';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb();
  __resetAudiobookshelfForTests();
  __resetDiscordForTests();
  __resetAppriseForTests();
  // Flip the default series to audiobook + configure ABS for it.
  await getDb().update(series).set({ contentType: 'audiobook' }).where(eq(series.id, h.seriesId));
  await audiobookshelfSetting.set({
    baseUrl: 'http://abs',
    apiToken: 'tok',
    libraryId: 'lib',
    contentTypes: ['audiobook'],
    enabled: true,
  });
});

afterEach(() => {
  vi.clearAllMocks();
  __resetAudiobookshelfForTests();
  __resetDiscordForTests();
  __resetAppriseForTests();
  h.cleanup();
});

async function seedImportableDownload(numFiles: number): Promise<number> {
  const releaseId = await upsertReleaseByGuid({
    indexerId: h.indexerId,
    indexerGuid: 'g',
    seriesId: h.seriesId,
    title: 'Test',
    link: 'magnet:?xt=urn:btih:' + 'a'.repeat(40),
    targetKind: 'volume',
    targetLow: 1,
    targetHigh: 1,
    groupName: null,
    language: 'en',
    sizeBytes: 100,
    seeders: 1,
    leechers: 0,
    publishedAt: new Date(),
    score: 0.9,
  });
  const downloadId = await insertDownload({
    releaseId,
    qbtHash: 'b'.repeat(40),
    status: 'completed',
  });
  const imported = [];
  for (let i = 0; i < numFiles; i++) {
    const [lf] = await getDb()
      .insert(libraryFiles)
      .values({
        seriesId: h.seriesId,
        volumeId: h.volumeId,
        chapterId: null,
        path: `/media/audiobooks/Test/${i}.mp3`,
        sizeBytes: 1,
        hashSha1: null,
        sourceReleaseId: releaseId,
      })
      .returning({ id: libraryFiles.id });
    imported.push({
      libraryFileId: lf!.id,
      path: `/media/audiobooks/Test/${i}.mp3`,
      targetKind: 'volume' as const,
      targetNumber: 1,
    });
  }
  (importerModule.importDownload as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    imported,
    skipped: [],
    conflicts: [],
    failed: [],
  });
  return downloadId;
}

describe('import.ts fires safeTriggerRefresh', () => {
  it('fires exactly once even for multi-file imports', async () => {
    const downloadId = await seedImportableDownload(3);
    let absCalls = 0;
    __setAudiobookshelfFetcherForTests(async () => {
      absCalls++;
      return { ok: true, status: 200, text: async () => '' };
    });

    await importDescriptor.handler({ downloadId }, 1);
    expect(absCalls).toBe(1);
  });

  it('does not fire when imported is empty', async () => {
    const downloadId = await seedImportableDownload(0);
    let absCalls = 0;
    __setAudiobookshelfFetcherForTests(async () => {
      absCalls++;
      return { ok: true, status: 200, text: async () => '' };
    });

    await importDescriptor.handler({ downloadId }, 1);
    expect(absCalls).toBe(0);
  });

  it('does not fire when importDownload throws', async () => {
    const downloadId = await seedImportableDownload(0);
    (importerModule.importDownload as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('boom'),
    );
    let absCalls = 0;
    __setAudiobookshelfFetcherForTests(async () => {
      absCalls++;
      return { ok: true, status: 200, text: async () => '' };
    });

    await expect(importDescriptor.handler({ downloadId }, 1)).rejects.toThrow(/boom/);
    expect(absCalls).toBe(0);
  });
});
