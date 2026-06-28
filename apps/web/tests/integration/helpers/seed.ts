import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { closeDb, getDb } from '@/server/db/client';
import { seedDefaultQualityProfile } from '@/server/db/quality-profiles';
import { seedDefaultIndexer } from '@/server/db/indexers';
import { insertSeries } from '@/server/db/series';
import { insertVolume } from '@/server/db/volumes';
import { insertChapter } from '@/server/db/chapters';
import { insertRelease } from '@/server/db/releases';

export type SeedHandle = {
  tmpDir: string;
  qpId: number;
  indexerId: number;
  seriesId: number;
  volumeId: number;
  chapterId: number;
  cleanup: () => void;
};

export type SeedOpts = {
  anilistId?: number;
  rootPath?: string;
  skipDefaultSeries?: boolean;
};

export async function seedDb(opts: SeedOpts = {}): Promise<SeedHandle> {
  const tmp = mkdtempSync(join(tmpdir(), 'bk-seed-'));
  process.env.BOOKKEEPRR_DB_PATH = join(tmp, 'test.db');
  migrate(getDb(), { migrationsFolder: './drizzle' });
  const qpId = await seedDefaultQualityProfile();
  const indexerId = await seedDefaultIndexer();
  let seriesId = 0;
  let volumeId = 0;
  let chapterId = 0;
  if (!opts.skipDefaultSeries) {
    seriesId = await insertSeries({
      anilistId: opts.anilistId ?? 1,
      status: 'releasing',
      rootPath: opts.rootPath ?? '/media/comics/Test Series',
      qualityProfileId: qpId,
      titleEnglish: 'Test Series',
    });
    volumeId = await insertVolume({ seriesId, number: 1, title: 'v1' });
    chapterId = await insertChapter({
      seriesId,
      numberText: '1',
      numberSort: 1,
      title: 'Chapter 1',
    });
  }
  return {
    tmpDir: tmp,
    qpId,
    indexerId,
    seriesId,
    volumeId,
    chapterId,
    cleanup: () => {
      closeDb();
      rmSync(tmp, { recursive: true, force: true });
    },
  };
}

export type SeedSeriesAndReleaseOpts = {
  qpId: number;
  indexerId: number;
  anilistId?: number;
  rootPath?: string;
  title?: string;
  score?: number | null;
  publishedAtMs?: number;
  groupName?: string | null;
  seeders?: number;
  targetLow?: number;
  targetHigh?: number;
};

export async function seedSeriesAndRelease(
  opts: SeedSeriesAndReleaseOpts,
): Promise<{ seriesId: number; releaseId: number }> {
  const seriesId = await insertSeries({
    anilistId: opts.anilistId ?? Math.floor(Math.random() * 1_000_000) + 1000,
    status: 'releasing',
    rootPath: opts.rootPath ?? `/media/comics/Seed-${Math.random()}`,
    qualityProfileId: opts.qpId,
    titleEnglish: opts.title ?? 'Seed Series',
  });
  const guid = `seed-${Math.random().toString(36).slice(2)}`;
  const releaseId = await insertRelease({
    seriesId,
    indexerId: opts.indexerId,
    indexerGuid: guid,
    title: opts.title ?? 'Seed Release [Group]',
    link: `magnet:?xt=urn:btih:${guid}`,
    targetKind: 'volume',
    targetLow: opts.targetLow ?? 1,
    targetHigh: opts.targetHigh ?? 1,
    groupName: opts.groupName ?? 'Group',
    language: 'en',
    sizeBytes: 100_000_000,
    seeders: opts.seeders ?? 10,
    leechers: 0,
    publishedAt: new Date(opts.publishedAtMs ?? Date.now()),
    score: opts.score ?? null,
  });
  return { seriesId, releaseId };
}
