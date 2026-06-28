import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { libraryFiles, volumes, chapters } from '@/server/db/schema';
import type { ReleaseRow, SeriesRow } from '@/server/db/schema';
import { getSeries } from '@/server/db/series';
import { listActiveDownloadsForSeries, updateDownload } from '@/server/db/downloads';
import { rangeCovers } from '@/server/auto-grab/decide';
import { deleteTorrent } from '@/server/integrations/qbittorrent';
import { qbtConnectionSetting, isQbtConfigured } from '@/server/db/settings/qbt';
import { recordAuditEvent } from '@/server/audit/record';
import { logger } from '@/server/logger';

// Statuses for siblings we may still cancel. `importing` is excluded — it's
// mid-import and must never be yanked; `imported`/`failed`/`superseded` are
// terminal.
const CANCELABLE: ('queued' | 'downloading' | 'completed')[] = [
  'queued',
  'downloading',
  'completed',
];

/**
 * Returns the integer targets a release would cover, or `null` when the range
 * is indeterminate. Conservative: a null/unknown bound yields `null` so the
 * caller spares the download rather than guessing.
 */
function releaseTargets(release: ReleaseRow): number[] | null {
  if (release.targetLow === null || release.targetHigh === null) return null;
  const low = Math.ceil(release.targetLow);
  const high = Math.floor(release.targetHigh);
  if (high < low) return null;
  const out: number[] = [];
  for (let n = low; n <= high; n++) out.push(n);
  return out;
}

/**
 * Cancel + delete still-active sibling downloads for `seriesId` whose release
 * covers only already-owned targets (the owned set includes whatever the
 * just-imported download added). Batches still covering an unowned target are
 * spared. Best-effort: never throws; on any per-download error we log and move
 * on. Returns the count actually superseded.
 *
 * Redundancy rule (CONSERVATIVE): a sibling is redundant iff every target its
 * release would cover is already owned — i.e. its *unowned-cover set is empty*.
 * When the targets are null/unknown or the range is indeterminate we treat the
 * release as NOT redundant and spare it. We never cancel on doubt.
 */
export async function cancelRedundantSiblingDownloads(
  importedDownloadId: number,
  seriesId: number,
): Promise<{ superseded: number }> {
  const log = logger().child({ component: 'cancel-redundant', seriesId });
  let superseded = 0;
  try {
    const series = await getSeries(seriesId);
    if (!series) return { superseded: 0 };

    const owned = await loadOwnedSet(series);

    const rows = await listActiveDownloadsForSeries(seriesId, CANCELABLE);
    const cfg = await qbtConnectionSetting.get();
    const qbtReady = isQbtConfigured(cfg);

    for (const { download, release } of rows) {
      if (download.id === importedDownloadId) continue;

      const targets = releaseTargets(release);
      // Indeterminate range → spare (never cancel on doubt).
      if (targets === null || targets.length === 0) continue;

      // The targets this release covers that are NOT yet owned. A `rangeCovers`
      // re-check guards against any off-by-one between the enumerated integers
      // and the stored low/high.
      const unownedCover = targets.filter((t) => !owned.has(t) && rangeCovers(release, t));
      if (unownedCover.length > 0) continue; // still useful → spare

      // Redundant: covers only already-owned targets.
      if (qbtReady) {
        try {
          await deleteTorrent(cfg, download.qbtHash, { deleteFiles: true });
        } catch (err) {
          log.warn(
            { err: (err as Error).message, downloadId: download.id, qbtHash: download.qbtHash },
            'redundant torrent delete failed; continuing',
          );
        }
      }

      await updateDownload(download.id, { status: 'superseded' });
      superseded += 1;
      log.info(
        {
          supersededDownloadId: download.id,
          byDownloadId: importedDownloadId,
          releaseId: release.id,
          qbtHash: download.qbtHash,
        },
        'cancelled redundant download',
      );
      await recordAuditEvent({
        actor: { kind: 'system' },
        action: 'download.superseded',
        target: { kind: 'download', id: String(download.id) },
        metadata: { seriesId, byDownloadId: importedDownloadId, releaseId: release.id },
      });
    }
  } catch (err) {
    log.warn({ err: (err as Error).message, importedDownloadId }, 'cancel-redundant sweep failed');
  }
  return { superseded };
}

/**
 * The owned target set per series granularity: volume numbers (volume series)
 * or chapter numberSorts (chapter series), reusing the `auto-grab/run.ts` join
 * query pattern. Reflects current library_files, including the just-imported
 * targets.
 */
async function loadOwnedSet(series: SeriesRow): Promise<Set<number>> {
  const owned = new Set<number>();
  if (series.granularity === 'volume') {
    const rows = await getDb()
      .select({ number: volumes.number })
      .from(libraryFiles)
      .innerJoin(volumes, eq(libraryFiles.volumeId, volumes.id))
      .where(eq(libraryFiles.seriesId, series.id));
    rows.forEach((r) => owned.add(r.number));
  } else {
    const rows = await getDb()
      .select({ numberSort: chapters.numberSort })
      .from(libraryFiles)
      .innerJoin(chapters, eq(libraryFiles.chapterId, chapters.id))
      .where(eq(libraryFiles.seriesId, series.id));
    rows.forEach((r) => owned.add(r.numberSort));
  }
  return owned;
}
