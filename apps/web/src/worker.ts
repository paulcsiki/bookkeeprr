import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { getDb, closeDb } from './server/db/client';
import { logger } from './server/logger';
import { env } from './server/config/env';
import { seedDefaultQualityProfile } from './server/db/quality-profiles';
import { seedDefaultIndexers } from './server/db/indexers';
import {
  startScheduler,
  tickEntry,
  metadataHydrateEntry,
  malHydrateEntry,
  mangadexChapterSyncEntry,
  mangadexVolumeHydrateEntry,
  libraryScanEntry,
  libraryHealthScanDrainEntry,
  libraryHealthScanWeeklyEntry,
  indexerPollFanoutEntry,
  missingSearchEntry,
  qbtWatchEntry,
  qbtAdoptEntry,
  importEntry,
  housekeepingEntry,
  comicvineHydrateEntry,
  novelUpdatesHydrateEntry,
  googleBooksHydrateEntry,
  ebookHydrateEntry,
  audiobookHydrateEntry,
  novelUpdatesChapterSyncEntry,
  novelUpdatesChapterSyncFanoutEntry,
  releaseMatchReplayEntry,
  updatesCheckEntry,
  cloudKeyRotationEntry,
  libraryRenameAllEntry,
  seriesReleaseSearchEntry,
  prowlarrSyncEntry,
  bookSeriesDetectEntry,
  type SchedulerHandle,
} from './server/jobs/scheduler';
import { heartbeatSetting } from './server/health';

const HEARTBEAT_INTERVAL_MS = 60_000;

async function writeHeartbeat(): Promise<void> {
  await heartbeatSetting.set(Date.now());
}

async function main(): Promise<void> {
  env();
  const log = logger().child({ component: 'worker' });
  log.info('worker starting');

  migrate(getDb(), { migrationsFolder: './drizzle' });
  log.info('migrations applied');

  await seedDefaultQualityProfile();
  log.info('default quality profile seeded');

  await seedDefaultIndexers();
  log.info('default indexers seeded');

  await writeHeartbeat();
  const heartbeatInterval = setInterval(() => {
    writeHeartbeat().catch((err: unknown) => log.error({ err }, 'heartbeat write failed'));
  }, HEARTBEAT_INTERVAL_MS);

  const schedulerHandle: SchedulerHandle = startScheduler([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tickEntry as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadataHydrateEntry as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    malHydrateEntry as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mangadexChapterSyncEntry as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mangadexVolumeHydrateEntry as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    libraryScanEntry as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    libraryHealthScanDrainEntry as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    libraryHealthScanWeeklyEntry as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    indexerPollFanoutEntry as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    missingSearchEntry as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    qbtWatchEntry as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    qbtAdoptEntry as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    importEntry as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    housekeepingEntry as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    comicvineHydrateEntry as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    novelUpdatesHydrateEntry as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    googleBooksHydrateEntry as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ebookHydrateEntry as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    audiobookHydrateEntry as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    novelUpdatesChapterSyncEntry as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    novelUpdatesChapterSyncFanoutEntry as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    releaseMatchReplayEntry as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updatesCheckEntry as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cloudKeyRotationEntry as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    libraryRenameAllEntry as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    seriesReleaseSearchEntry as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prowlarrSyncEntry as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bookSeriesDetectEntry as any,
  ]);

  const shutdown = (signal: NodeJS.Signals): void => {
    log.info({ signal }, 'worker shutting down');
    clearInterval(heartbeatInterval);
    schedulerHandle.stop();
    closeDb();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  log.info('worker ready');
}

main().catch((err: unknown) => {
  logger().error({ err }, 'worker failed to start');
  process.exit(1);
});
