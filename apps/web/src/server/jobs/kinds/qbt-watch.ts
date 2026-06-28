import { z } from 'zod';
import { listTorrentsInCategory, deleteTorrent, QbittorrentError } from '@/server/integrations/qbittorrent';
import { qbtConnectionSetting, isQbtConfigured } from '@/server/db/settings/qbt';
import { listPendingDownloads, updateDownload, type DownloadStatus } from '@/server/db/downloads';
import { getRelease } from '@/server/db/releases';
import { getSeries } from '@/server/db/series';
import { enqueueJob, hasPendingImportFor } from '@/server/db/jobs';
import { logger } from '@/server/logger';
import type { ContentType } from '@/server/content-type';
import { getQbtCategory } from '@/server/content-type/paths';
import { runUntilIdle } from '@/server/jobs/runner';
import { importDescriptor } from './import';
import type { JobKindDescriptor } from '../types';
import { DEFAULT_RETRY_POLICY, DEFAULT_TIMEOUT_MS } from '../types';

/**
 * Kick the just-enqueued import job(s) immediately instead of waiting for the
 * per-minute worker tick, so a completed download imports within ~1s.
 * Fire-and-forget (not awaited). Safe alongside the worker: `claimNextJob` is
 * an atomic immediate transaction and the import handler is idempotent, so
 * neither can double-process. Skipped under Vitest to keep the job's enqueue
 * assertions deterministic; the worker tick remains the fallback.
 */
function kickImport(): void {
  if (process.env.VITEST) return;
  void runUntilIdle(importDescriptor).catch(() => {});
}

const Payload = z.object({}).passthrough();

type Result = {
  skipped?: 'not-configured' | 'no-active-downloads';
  torrentsSeen: number;
  statusesChanged: number;
  importsEnqueued: number;
  errors: { hash: string; message: string }[];
};

async function activeCategories(): Promise<string[]> {
  const pending = await listPendingDownloads();
  if (pending.length === 0) return [];
  const contentTypes = new Set<ContentType>();
  for (const d of pending) {
    const release = await getRelease(d.releaseId);
    if (!release || release.seriesId === null) continue;
    const seriesRow = await getSeries(release.seriesId);
    if (seriesRow) contentTypes.add(seriesRow.contentType);
  }
  const cats: string[] = [];
  const seen = new Set<string>();
  for (const t of contentTypes) {
    const cat = await getQbtCategory(t);
    if (!seen.has(cat)) {
      seen.add(cat);
      cats.push(cat);
    }
  }
  return cats;
}

const COMPLETED_STATES = new Set([
  'uploading',
  'pausedUP',
  'stalledUP',
  'queuedUP',
  'checkingUP',
  'forcedUP',
]);
const FAILED_STATES = new Set(['error', 'missingFiles']);

// Grace before a pending download whose torrent is absent from qBit is marked
// failed — covers the window where qBit hasn't yet registered a fresh add.
const MISSING_TORRENT_GRACE_MS = 10 * 60 * 1000;

// A downloading torrent is considered stalled when no bytes arrived for this long.
const STALL_TIMEOUT_MS = 5 * 60 * 1000;

export function mapQbtState(state: string, progress: number): DownloadStatus {
  // Progress wins over state: if the file is fully on disk, treat the
  // download as completed regardless of what the tracker/peer machinery is
  // doing. qBit can report `state: 'error'` for WebSeed-only torrents
  // (tracker returns no peers, all data came from the WebSeed URL) even
  // though `progress === 1` and the bytes are written. Without this check,
  // those downloads get marked `failed` and the importer never runs.
  if (progress >= 1.0) return 'completed';
  if (FAILED_STATES.has(state)) return 'failed';
  if (COMPLETED_STATES.has(state)) return 'completed';
  return 'downloading';
}

export const qbtWatchDescriptor: JobKindDescriptor<Record<string, unknown>, Result> = {
  kind: 'qbt_watch',
  retryPolicy: DEFAULT_RETRY_POLICY,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  handler: async (rawPayload) => {
    const log = logger().child({ component: 'qbt_watch' });
    Payload.parse(rawPayload);
    const errors: Result['errors'] = [];
    let statusesChanged = 0;
    let importsEnqueued = 0;

    const cfg = await qbtConnectionSetting.get();
    if (!isQbtConfigured(cfg)) {
      return {
        skipped: 'not-configured',
        torrentsSeen: 0,
        statusesChanged: 0,
        importsEnqueued: 0,
        errors: [],
      };
    }

    const cats = await activeCategories();
    if (cats.length === 0) {
      return {
        skipped: 'no-active-downloads',
        torrentsSeen: 0,
        statusesChanged: 0,
        importsEnqueued: 0,
        errors: [],
      };
    }

    let torrents: Awaited<ReturnType<typeof listTorrentsInCategory>> = [];
    for (const cat of cats) {
      try {
        const catTorrents = await listTorrentsInCategory(cfg, cat);
        torrents = torrents.concat(catTorrents);
      } catch (err) {
        const message = err instanceof QbittorrentError ? err.message : (err as Error).message;
        log.warn({ err: message, category: cat }, 'qbt list failed for category');
        throw err; // bubble to runner retry
      }
    }

    const pending = await listPendingDownloads();
    const byHash = new Map(pending.map((d) => [d.qbtHash, d]));

    const now = Date.now();
    for (const t of torrents) {
      const d = byHash.get(t.hash);
      if (!d) continue;
      const newStatus = mapQbtState(t.state, t.progress);

      // Stall detection: only applies to downloads we track as `downloading`.
      // Condition: the torrent is still `downloading` in our DB AND the qBit
      // state also maps to `downloading` (not completed/failed). Then:
      //   - If `completed` bytes increased vs stored, update progress fields.
      //   - Else if dlspeed=0 AND now-lastProgressAt >= STALL_TIMEOUT_MS, stall.
      if (d.status === 'downloading' && newStatus === 'downloading') {
        const completedBytes = t.completed ?? 0;
        const storedBytes = d.bytesDownloaded ?? 0;
        if (completedBytes > storedBytes) {
          // Progress made — update the progress tracking fields.
          await updateDownload(d.id, {
            bytesDownloaded: completedBytes,
            lastProgressAt: new Date(),
          });
        } else {
          // No new bytes. Check if stalled.
          const dlspeed = t.dlspeed ?? 0;
          const lastProgressAt = d.lastProgressAt ?? d.addedAt;
          const stalledMs = now - lastProgressAt.getTime();
          if (dlspeed === 0 && stalledMs >= STALL_TIMEOUT_MS) {
            // Stalled: mark failed and delete torrent to free the slot.
            log.warn(
              { downloadId: d.id, qbtHash: d.qbtHash, stalledMs },
              'download stalled — marking failed and deleting torrent',
            );
            statusesChanged++;
            await updateDownload(d.id, {
              status: 'failed',
              error: `stalled-5m`,
            });
            try {
              await deleteTorrent(cfg, d.qbtHash, { deleteFiles: true });
            } catch (err) {
              log.warn(
                { err: (err as Error).message, downloadId: d.id, qbtHash: d.qbtHash },
                'stalled torrent delete failed; download still marked failed',
              );
            }
            continue; // skip normal status-change logic for this download
          }
        }
        // No status change — continue without the normal transition block.
        continue;
      }

      if (newStatus !== d.status) {
        statusesChanged++;
        await updateDownload(d.id, {
          status: newStatus,
          completedAt: newStatus === 'completed' ? new Date() : d.completedAt,
        });
        if (newStatus === 'completed' && d.status !== 'completed' && d.status !== 'imported') {
          // Dedup: a torrent whose qBit state flaps across restarts can hit the
          // completed-transition repeatedly. Skip enqueueing a second import if
          // one is already pending/running for this download — otherwise the
          // duplicate jobs spam notifications and run against an already-cleaned
          // torrent (404). The status-transition guard above is the first line
          // of defence; this covers the case where the row hasn't yet flipped
          // to 'imported' but an import is already in flight.
          if (await hasPendingImportFor(d.id)) {
            log.info({ downloadId: d.id }, 'import already pending/running; skip enqueue');
          } else {
            await enqueueJob('import', { downloadId: d.id });
            importsEnqueued++;
          }
        }
        if (newStatus === 'failed') {
          await updateDownload(d.id, { error: `qbt-state:${t.state}` });
        }
      }
    }

    // Reconcile downloads whose torrent has vanished from qBittorrent (manually
    // removed, etc.) so they don't sit 'queued' forever. Use a grace period so a
    // freshly-grabbed torrent qBit hasn't registered yet isn't failed by mistake.
    const seenHashes = new Set(torrents.map((t) => t.hash.toLowerCase()));
    const graceCutoff = Date.now() - MISSING_TORRENT_GRACE_MS;
    for (const d of pending) {
      if (seenHashes.has(d.qbtHash.toLowerCase())) continue;
      if (d.addedAt.getTime() > graceCutoff) continue; // too new — give qBit time
      statusesChanged++;
      await updateDownload(d.id, {
        status: 'failed',
        error: 'torrent missing from qbittorrent',
      });
    }

    // Run any newly-enqueued imports right away (fire-and-forget); the
    // per-minute worker tick remains the fallback.
    if (importsEnqueued > 0) kickImport();

    return {
      torrentsSeen: torrents.length,
      statusesChanged,
      importsEnqueued,
      errors,
    };
  },
};
