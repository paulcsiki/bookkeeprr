import cron, { type ScheduledTask } from 'node-cron';
import { enqueueJob } from '../db/jobs';
import { logger } from '../logger';
import { runOnce, runUntilIdle } from './runner';
import type { JobKindDescriptor } from './types';
import { DEFAULT_RETRY_POLICY, DEFAULT_TIMEOUT_MS } from './types';
import { metadataHydrateDescriptor } from './kinds/metadata-hydrate';
import { malHydrateDescriptor } from './kinds/mal-hydrate';
import { mangadexChapterSyncDescriptor } from './kinds/mangadex-chapter-sync';
import {
  mangadexVolumeHydrateDescriptor,
  type MangadexVolumeHydrateResult,
} from './kinds/mangadex-volume-hydrate';
import { libraryScanDescriptor } from './kinds/library-scan';
import {
  libraryHealthScanDescriptor,
  type LibraryHealthScanResult,
} from './kinds/library-health-scan';
import { indexerPollFanoutDescriptor, type FanoutResult } from './kinds/indexer-poll-fanout';
import { missingSearchDescriptor } from './kinds/missing-search';
import { qbtWatchDescriptor } from './kinds/qbt-watch';
import { qbtAdoptDescriptor } from './kinds/qbt-adopt';
import { importDescriptor } from './kinds/import';
import { housekeepingDescriptor } from './kinds/housekeeping';
import { comicvineHydrateDescriptor, type ComicVineHydrateResult } from './kinds/comicvine-hydrate';
import {
  novelUpdatesHydrateDescriptor,
  type NovelUpdatesHydrateResult,
} from './kinds/novel-updates-hydrate';
import {
  novelUpdatesChapterSyncDescriptor,
  type NovelUpdatesChapterSyncResult,
} from './kinds/novel-updates-chapter-sync';
import {
  novelUpdatesChapterSyncFanoutDescriptor,
  type NovelUpdatesChapterSyncFanoutResult,
} from './kinds/novel-updates-chapter-sync-fanout';
import {
  googleBooksHydrateDescriptor,
  type GoogleBooksHydrateResult,
} from './kinds/googlebooks-hydrate';
import { ebookHydrateDescriptor, type EbookHydrateResult } from './kinds/ebook-hydrate';
import {
  audiobookHydrateDescriptor,
  type AudiobookHydrateResult,
} from './kinds/audiobook-hydrate';
import {
  releaseMatchReplayDescriptor,
  type ReleaseMatchReplayResult,
} from './kinds/release-match-replay';
import { updatesCheckDescriptor, type UpdatesCheckResult } from './kinds/updates-check';
import {
  libraryRenameAllDescriptor,
  type LibraryRenameAllResult,
} from './kinds/library-rename-all';
import {
  cloudKeyRotationDescriptor,
  type CloudKeyRotationResult,
} from './kinds/cloud-key-rotation';
import { prowlarrSyncDescriptor } from './kinds/prowlarr-sync';
import {
  seriesReleaseSearchDescriptor,
  type SeriesReleaseSearchResult,
} from './kinds/series-release-search';
import {
  bookSeriesDetectDescriptor,
  type BookSeriesDetectResult,
} from './kinds/book-series-detect';

export type ScheduleEntry<P, R> = {
  cronExpression: string;
  descriptor: JobKindDescriptor<P, R>;
  enqueuePayload?: () => P; // optional — if absent, no pre-enqueue
  drain?: boolean; // if true, runUntilIdle instead of runOnce
};

export type SchedulerHandle = {
  stop(): void;
};

export function startScheduler(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entries: readonly ScheduleEntry<any, any>[],
): SchedulerHandle {
  const log = logger().child({ component: 'scheduler' });
  const tasks: ScheduledTask[] = [];

  for (const entry of entries) {
    const task = cron.schedule(entry.cronExpression, async () => {
      if (entry.enqueuePayload) {
        try {
          await enqueueJob(entry.descriptor.kind, entry.enqueuePayload());
        } catch (err) {
          log.error({ err, kind: entry.descriptor.kind }, 'scheduler enqueue failed');
        }
      }
      try {
        if (entry.drain) {
          await runUntilIdle(entry.descriptor);
        } else {
          await runOnce(entry.descriptor);
        }
      } catch (err) {
        log.error({ err, kind: entry.descriptor.kind }, 'scheduler run failed');
      }
    });
    tasks.push(task);
    log.info({ kind: entry.descriptor.kind, cron: entry.cronExpression }, 'scheduled');
  }

  return {
    stop(): void {
      for (const task of tasks) task.stop();
    },
  };
}

// Stub "tick" job kind for M2. M3+ replaces this with real kinds.
export const tickDescriptor: JobKindDescriptor<{ at: number }, null> = {
  kind: 'tick',
  handler: async (payload) => {
    logger().child({ component: 'tick' }).info({ at: payload.at }, 'worker tick');
    return null;
  },
  retryPolicy: DEFAULT_RETRY_POLICY,
  timeoutMs: DEFAULT_TIMEOUT_MS,
};

export const tickEntry: ScheduleEntry<{ at: number }, null> = {
  cronExpression: '* * * * *',
  enqueuePayload: () => ({ at: Date.now() }),
  descriptor: tickDescriptor,
};

export const metadataHydrateEntry: ScheduleEntry<{ seriesId: number }, { volumesAdded: number }> = {
  cronExpression: '* * * * *',
  descriptor: metadataHydrateDescriptor,
  drain: true,
};

// Event-driven (enqueued by the MAL-only add path); no cron pre-enqueue. The
// entry exists so the scheduler drains pending mal_hydrate jobs.
export const malHydrateEntry: ScheduleEntry<{ seriesId: number }, { volumesAdded: number }> = {
  cronExpression: '* * * * *',
  descriptor: malHydrateDescriptor,
  drain: true,
};

export const mangadexChapterSyncEntry: ScheduleEntry<
  { seriesId: number },
  { chaptersAdded: number }
> = {
  cronExpression: '* * * * *',
  descriptor: mangadexChapterSyncDescriptor,
  drain: true,
};

// Event-driven (chained from metadata_hydrate); no cron pre-enqueue. The entry
// exists so the scheduler drains pending mangadex_volume_hydrate jobs.
export const mangadexVolumeHydrateEntry: ScheduleEntry<
  { seriesId: number },
  MangadexVolumeHydrateResult
> = {
  cronExpression: '* * * * *',
  descriptor: mangadexVolumeHydrateDescriptor,
  drain: true,
};

export const libraryScanEntry: ScheduleEntry<
  { rootPath: string },
  { scanned: number; matched: number }
> = {
  cronExpression: '* * * * *',
  descriptor: libraryScanDescriptor,
  drain: true,
};

// On-demand drain for library_health_scan: runs every minute so a job enqueued
// via POST /api/library/health-scan is picked up within ~a minute rather than
// waiting up to 7 days for the weekly tick.
export const libraryHealthScanDrainEntry: ScheduleEntry<
  Record<string, never>,
  LibraryHealthScanResult
> = {
  cronExpression: '* * * * *',
  descriptor: libraryHealthScanDescriptor,
  drain: true,
};

// Weekly library health scan auto-enqueue: opens every file with the reader
// probers and deletes / re-grabs corrupt or wrong-format content. Runs Sundays
// at 05:00 to keep it clear of the nightly housekeeping window. The drain
// entry above (minute cadence) is what actually runs the job.
export const libraryHealthScanWeeklyEntry: ScheduleEntry<
  Record<string, never>,
  LibraryHealthScanResult
> = {
  cronExpression: '0 5 * * 0',
  descriptor: libraryHealthScanDescriptor,
  enqueuePayload: () => ({}),
};

export const indexerPollFanoutEntry: ScheduleEntry<Record<string, never>, FanoutResult> = {
  cronExpression: '* * * * *',
  descriptor: indexerPollFanoutDescriptor,
  enqueuePayload: () => ({}),
};

export const missingSearchEntry: ScheduleEntry<Record<string, unknown>, unknown> = {
  cronExpression: '0 */6 * * *',
  descriptor: missingSearchDescriptor,
  enqueuePayload: () => ({}),
  drain: true,
};

export const qbtWatchEntry: ScheduleEntry<Record<string, unknown>, unknown> = {
  cronExpression: '*/2 * * * *',
  descriptor: qbtWatchDescriptor,
  enqueuePayload: () => ({}),
  drain: true,
};

export const qbtAdoptEntry: ScheduleEntry<Record<string, unknown>, unknown> = {
  cronExpression: '*/2 * * * *',
  descriptor: qbtAdoptDescriptor,
  enqueuePayload: () => ({}),
  drain: true,
};

export const importEntry: ScheduleEntry<{ downloadId: number }, unknown> = {
  cronExpression: '* * * * *',
  descriptor: importDescriptor,
  drain: true,
};

export const housekeepingEntry: ScheduleEntry<Record<string, unknown>, unknown> = {
  cronExpression: '0 3 * * *',
  descriptor: housekeepingDescriptor,
  enqueuePayload: () => ({}),
  drain: true,
};

export const comicvineHydrateEntry: ScheduleEntry<{ seriesId: number }, ComicVineHydrateResult> = {
  cronExpression: '* * * * *',
  descriptor: comicvineHydrateDescriptor,
  drain: true,
};

export const novelUpdatesHydrateEntry: ScheduleEntry<
  { seriesId: number },
  NovelUpdatesHydrateResult
> = {
  cronExpression: '* * * * *',
  descriptor: novelUpdatesHydrateDescriptor,
  drain: true,
};

// Event-driven (enqueued by light-novel add + refresh-metadata); no cron
// pre-enqueue. The entry exists so the scheduler drains pending
// googlebooks_hydrate jobs.
export const googleBooksHydrateEntry: ScheduleEntry<
  { seriesId: number },
  GoogleBooksHydrateResult
> = {
  cronExpression: '* * * * *',
  descriptor: googleBooksHydrateDescriptor,
  drain: true,
};

// Event-driven (enqueued by the ebook add path); no cron pre-enqueue. The
// entry exists so the scheduler drains pending ebook_hydrate jobs.
export const ebookHydrateEntry: ScheduleEntry<{ seriesId: number }, EbookHydrateResult> = {
  cronExpression: '* * * * *',
  descriptor: ebookHydrateDescriptor,
  drain: true,
};

// Event-driven (enqueued by the audiobook add / refresh-metadata path); no cron
// pre-enqueue. The entry exists so the scheduler drains pending
// audiobook_hydrate jobs.
export const audiobookHydrateEntry: ScheduleEntry<
  { seriesId: number },
  AudiobookHydrateResult
> = {
  cronExpression: '* * * * *',
  descriptor: audiobookHydrateDescriptor,
  drain: true,
};

export const novelUpdatesChapterSyncEntry: ScheduleEntry<
  { seriesId: number },
  NovelUpdatesChapterSyncResult
> = {
  cronExpression: '* * * * *',
  descriptor: novelUpdatesChapterSyncDescriptor,
  drain: true,
};

export const novelUpdatesChapterSyncFanoutEntry: ScheduleEntry<
  Record<string, never>,
  NovelUpdatesChapterSyncFanoutResult
> = {
  cronExpression: '0 */6 * * *',
  descriptor: novelUpdatesChapterSyncFanoutDescriptor,
  enqueuePayload: () => ({}),
};

// Manual-enqueue only (no cron pre-enqueue); the entry exists so the
// scheduler drains pending release_match_replay jobs each minute.
export const releaseMatchReplayEntry: ScheduleEntry<
  { replayRunId: number },
  ReleaseMatchReplayResult
> = {
  cronExpression: '* * * * *',
  descriptor: releaseMatchReplayDescriptor,
  drain: true,
};

export const updatesCheckEntry: ScheduleEntry<Record<string, never>, UpdatesCheckResult> = {
  cronExpression: '17 3 * * *',
  descriptor: updatesCheckDescriptor,
  enqueuePayload: () => ({}),
};

// Monthly cloud signing-key rotation. Runs at 04:00 on the 1st of every
// month. No-ops when cloud is disconnected.
export const cloudKeyRotationEntry: ScheduleEntry<Record<string, never>, CloudKeyRotationResult> = {
  cronExpression: '0 4 1 * *',
  descriptor: cloudKeyRotationDescriptor,
  enqueuePayload: () => ({}),
};

// On-demand only (no cron pre-enqueue): triggered by POST /api/library/rename-all.
// The entry exists so the scheduler drains pending library_rename_all jobs.
export const libraryRenameAllEntry: ScheduleEntry<
  Record<string, never>,
  LibraryRenameAllResult
> = {
  cronExpression: '* * * * *',
  descriptor: libraryRenameAllDescriptor,
  drain: true,
};

// Event-driven (enqueued on add); no cron pre-enqueue. The entry exists so the
// scheduler drains pending series_release_search jobs.
export const seriesReleaseSearchEntry: ScheduleEntry<
  { seriesId: number },
  SeriesReleaseSearchResult
> = {
  cronExpression: '* * * * *',
  descriptor: seriesReleaseSearchDescriptor,
  drain: true,
};

// Daily Prowlarr auto-sync. No-ops when Prowlarr is not configured.
export const prowlarrSyncEntry: ScheduleEntry<Record<string, never>, unknown> = {
  cronExpression: '30 4 * * *',
  descriptor: prowlarrSyncDescriptor,
  enqueuePayload: () => ({}),
  drain: true,
};

// Event-driven (enqueued by ebook/audiobook add + refresh route); no cron
// pre-enqueue. The entry exists so the scheduler drains pending
// book_series_detect jobs each minute.
export const bookSeriesDetectEntry: ScheduleEntry<{ seriesId: number }, BookSeriesDetectResult> = {
  cronExpression: '* * * * *',
  descriptor: bookSeriesDetectDescriptor,
  drain: true,
};
