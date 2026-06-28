import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { getDb } from './client';
import {
  downloads,
  indexers,
  releases,
  series,
  type DownloadRow,
  type ReleaseRow,
} from './schema';
import { withWriteLock } from './write-lock';
import type { QueueJoinRow } from '@/server/readarr/queue-mapper';
import type { FailedJoinRow, GrabbedJoinRow } from '@/server/readarr/history-mapper';

export type DownloadStatus =
  | 'queued'
  | 'downloading'
  | 'completed'
  | 'importing'
  | 'imported'
  | 'failed'
  | 'superseded';

export type DownloadCreate = {
  releaseId: number;
  qbtHash: string;
  status?: DownloadStatus;
};

export type DownloadUpdate = Partial<{
  status: DownloadStatus;
  completedAt: Date | null;
  importedAt: Date | null;
  error: string | null;
  bytesDownloaded: number;
  lastProgressAt: Date | null;
}>;

export async function insertDownload(input: DownloadCreate): Promise<number> {
  return withWriteLock(async () => {
    const now = new Date();
    const [row] = await getDb()
      .insert(downloads)
      .values({
        releaseId: input.releaseId,
        qbtHash: input.qbtHash,
        status: input.status ?? 'queued',
        // Initialize lastProgressAt to now so the 5-minute stall window starts
        // at grab time rather than the epoch.
        lastProgressAt: now,
        bytesDownloaded: 0,
      })
      .returning({ id: downloads.id });
    if (!row) throw new Error('insertDownload: insert returned no row');
    return row.id;
  });
}

export async function getDownload(id: number): Promise<DownloadRow | null> {
  const rows = await getDb().select().from(downloads).where(eq(downloads.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getDownloadByQbtHash(qbtHash: string): Promise<DownloadRow | null> {
  const rows = await getDb()
    .select()
    .from(downloads)
    .where(eq(downloads.qbtHash, qbtHash))
    .limit(1);
  return rows[0] ?? null;
}

export async function listDownloads(): Promise<DownloadRow[]> {
  return getDb().select().from(downloads);
}

export async function updateDownload(id: number, patch: DownloadUpdate): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  await withWriteLock(() => getDb().update(downloads).set(patch).where(eq(downloads.id, id)));
}

export async function deleteDownload(id: number): Promise<void> {
  await withWriteLock(() => getDb().delete(downloads).where(eq(downloads.id, id)));
}

const PENDING_STATUSES: DownloadStatus[] = ['queued', 'downloading', 'completed', 'importing'];

export async function listPendingDownloads(): Promise<DownloadRow[]> {
  return getDb().select().from(downloads).where(inArray(downloads.status, PENDING_STATUSES));
}

export async function listImportedDownloads(): Promise<DownloadRow[]> {
  return getDb().select().from(downloads).where(eq(downloads.status, 'imported'));
}

export async function listDownloadsByRelease(releaseId: number): Promise<DownloadRow[]> {
  return getDb().select().from(downloads).where(eq(downloads.releaseId, releaseId));
}

export async function listDownloadsForReleaseIds(releaseIds: number[]): Promise<DownloadRow[]> {
  if (releaseIds.length === 0) return [];
  return getDb().select().from(downloads).where(inArray(downloads.releaseId, releaseIds));
}

/**
 * Returns true when any active (non-failed, non-superseded) download exists for
 * a release that covers `target` in the given series. Used by the auto-grab loop
 * to enforce the one-active-grab-per-target rule: we never open a second grab
 * for a target that already has one in flight (queued/downloading/completed/
 * importing/imported).
 *
 * NOTE: `failed` and `superseded` are explicitly excluded — a stalled download
 * that was marked `failed` is no longer active, so the next cycle may grab the
 * next-best candidate.
 */
export async function hasActiveDownloadForSeriesTarget(
  seriesId: number,
  target: number,
): Promise<boolean> {
  const ACTIVE_NON_FAILED: DownloadStatus[] = [
    'queued',
    'downloading',
    'completed',
    'importing',
    'imported',
  ];
  const rows = await getDb()
    .select({ downloadId: downloads.id })
    .from(downloads)
    .innerJoin(releases, eq(downloads.releaseId, releases.id))
    .where(
      and(
        eq(releases.seriesId, seriesId),
        inArray(downloads.status, ACTIVE_NON_FAILED),
        // targetLow and targetHigh cover the target (target >= targetLow AND target <= targetHigh)
        sql`${releases.targetLow} IS NOT NULL AND ${releases.targetHigh} IS NOT NULL AND ${releases.targetLow} <= ${target} AND ${releases.targetHigh} >= ${target}`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Downloads for a series in the given statuses, paired with their release.
 * Joins downloads→releases and filters by `releases.seriesId`. Used by the
 * post-import redundancy sweep to find still-active sibling downloads.
 */
export async function listActiveDownloadsForSeries(
  seriesId: number,
  statuses: DownloadStatus[],
): Promise<{ download: DownloadRow; release: ReleaseRow }[]> {
  if (statuses.length === 0) return [];
  const rows = await getDb()
    .select({ download: downloads, release: releases })
    .from(downloads)
    .innerJoin(releases, eq(downloads.releaseId, releases.id))
    .where(and(eq(releases.seriesId, seriesId), inArray(downloads.status, statuses)));
  return rows;
}

export async function listActiveDownloadsForQueue(
  limit: number,
  offset: number,
): Promise<{ rows: QueueJoinRow[]; total: number }> {
  const db = getDb();
  const rows = await db
    .select({
      downloadId: downloads.id,
      downloadStatus: downloads.status,
      downloadAddedAt: downloads.addedAt,
      downloadError: downloads.error,
      qbtHash: downloads.qbtHash,
      releaseTitle: releases.title,
      releaseSizeBytes: releases.sizeBytes,
      seriesId: releases.seriesId,
      indexerName: indexers.name,
    })
    .from(downloads)
    .innerJoin(releases, eq(downloads.releaseId, releases.id))
    .innerJoin(indexers, eq(releases.indexerId, indexers.id))
    .innerJoin(series, eq(releases.seriesId, series.id))
    .where(and(ne(downloads.status, 'imported'), ne(downloads.status, 'superseded')))
    .orderBy(desc(downloads.addedAt))
    .limit(limit)
    .offset(offset);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(downloads)
    .innerJoin(releases, eq(downloads.releaseId, releases.id))
    .innerJoin(series, eq(releases.seriesId, series.id))
    .where(and(ne(downloads.status, 'imported'), ne(downloads.status, 'superseded')));

  const mapped: QueueJoinRow[] = rows.map((r) => ({
    downloadId: r.downloadId,
    downloadStatus: r.downloadStatus,
    downloadAddedAt: r.downloadAddedAt,
    downloadError: r.downloadError,
    qbtHash: r.qbtHash,
    releaseTitle: r.releaseTitle,
    releaseSizeBytes: r.releaseSizeBytes,
    seriesId: r.seriesId as number,
    indexerName: r.indexerName,
    volumeId: null,
  }));

  return { rows: mapped, total: Number(countRow?.count ?? 0) };
}

export async function listGrabbedForHistory(limit: number): Promise<GrabbedJoinRow[]> {
  const rows = await getDb()
    .select({
      downloadId: downloads.id,
      qbtHash: downloads.qbtHash,
      addedAt: downloads.addedAt,
      releaseTitle: releases.title,
      seriesId: releases.seriesId,
    })
    .from(downloads)
    .innerJoin(releases, eq(downloads.releaseId, releases.id))
    .orderBy(desc(downloads.addedAt))
    .limit(limit);
  return rows
    .filter((r): r is typeof r & { seriesId: number } => r.seriesId !== null)
    .map((r) => ({
      downloadId: r.downloadId,
      qbtHash: r.qbtHash,
      addedAt: r.addedAt,
      releaseTitle: r.releaseTitle,
      seriesId: r.seriesId,
      volumeId: null,
    }));
}

export async function listFailedForHistory(limit: number): Promise<FailedJoinRow[]> {
  const rows = await getDb()
    .select({
      downloadId: downloads.id,
      qbtHash: downloads.qbtHash,
      addedAt: downloads.addedAt,
      releaseTitle: releases.title,
      seriesId: releases.seriesId,
      error: downloads.error,
    })
    .from(downloads)
    .innerJoin(releases, eq(downloads.releaseId, releases.id))
    .where(and(eq(downloads.status, 'failed'), sql`${downloads.error} IS NOT NULL`))
    .orderBy(desc(downloads.addedAt))
    .limit(limit);
  return rows
    .filter(
      (r): r is typeof r & { seriesId: number; error: string } =>
        r.seriesId !== null && r.error !== null,
    )
    .map((r) => ({
      downloadId: r.downloadId,
      qbtHash: r.qbtHash,
      addedAt: r.addedAt,
      releaseTitle: r.releaseTitle,
      seriesId: r.seriesId,
      volumeId: null,
      error: r.error,
    }));
}
