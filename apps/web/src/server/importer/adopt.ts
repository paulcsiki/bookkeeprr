/**
 * adopt.ts — create a series from a matched Candidate and adopt existing
 * on-disk files as library_files (in-place, no moving/renaming).
 *
 * Used by the import-grid confirm step.
 */

import { and, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { series } from '@/server/db/schema';
import { insertSeries, updateSeries } from '@/server/db/series';
import { insertVolume, listVolumesBySeries } from '@/server/db/volumes';
import { insertLibraryFile, getLibraryFileByPath } from '@/server/db/library-files';
import { enqueueJob } from '@/server/db/jobs';
import { contentTypeSubdir, getMediaRoot } from '@/server/content-type/paths';
import { ebookHydrateDescriptor } from '@/server/jobs/kinds/ebook-hydrate';
import { audiobookHydrateDescriptor } from '@/server/jobs/kinds/audiobook-hydrate';
import { bookSeriesDetectDescriptor } from '@/server/jobs/kinds/book-series-detect';
import { googleBooksHydrateDescriptor } from '@/server/jobs/kinds/googlebooks-hydrate';
import { sanitizeForFs, kickHydrate, enqueueReleaseSearchOnAdd } from './series-helpers';
import type { ScanItem } from './import-scan';
import type { Candidate } from './match-candidate';
import type { ContentType } from '@/server/content-type';

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export type AdoptRow = {
  item: ScanItem;
  match: Candidate;
  monitor: boolean;
  qualityProfileId: number;
};

// ---------------------------------------------------------------------------
// Core: create a series from a matched Candidate
// ---------------------------------------------------------------------------

/**
 * Insert a new series row for the given Candidate + content type, enqueue the
 * appropriate hydrate jobs, and return the new series id.
 *
 * For ebook: mirrors the route's ebook branch (insertSeries + enqueue
 * ebook_hydrate / book_series_detect + optional release-search).
 * For audiobook: mirrors the route's audiobook branch.
 * Other content types are not supported by this path (use the route directly).
 */
export async function createSeriesFromMatch(
  m: Candidate,
  contentType: ContentType,
  opts: {
    qualityProfileId: number;
    monitoring: 'all' | 'none';
    /** Route-only extras — the import flow leaves these undefined. */
    description?: string | null;
    /** Defaults to 1 when undefined (import flow always creates a single volume). */
    totalVolumes?: number | null;
    groupId?: number | null;
    asin?: string | null;
    narrator?: string | null;
    runtimeMinutes?: number | null;
  },
): Promise<number> {
  if (contentType === 'ebook') {
    const authorSafe = sanitizeForFs(m.author ?? 'Unknown');
    const titleSafe = sanitizeForFs(m.title);
    const baseRoot = `/media/books/${authorSafe}/${titleSafe}`;
    const id = await insertSeries({
      contentType: 'ebook',
      openlibraryId: m.source === 'openlibrary' ? m.sourceId : null,
      isbn: m.isbn ?? null,
      author: m.author ?? null,
      titleEnglish: m.title,
      status: 'finished',
      rootPath: baseRoot,
      qualityProfileId: opts.qualityProfileId,
      coverUrl: m.coverUrl ?? null,
      description: opts.description ?? null,
      totalVolumes: opts.totalVolumes ?? 1,
      granularity: 'volume',
      monitoring: opts.monitoring,
      groupId: opts.groupId ?? null,
    });
    // googlebooks id lives in a separate column — set it after insert since
    // SeriesCreate doesn't expose it (it's a SeriesUpdate field only).
    if (m.source === 'googlebooks') {
      await updateSeries(id, { googleBooksVolumeId: m.sourceId });
    }
    await enqueueReleaseSearchOnAdd(id, opts.monitoring);
    await enqueueJob('ebook_hydrate', { seriesId: id });
    await enqueueJob('book_series_detect', { seriesId: id });
    kickHydrate(ebookHydrateDescriptor, bookSeriesDetectDescriptor);
    return id;
  }

  if (contentType === 'light_novel') {
    const authorSafe = sanitizeForFs(m.author ?? 'Unknown');
    const titleSafe = sanitizeForFs(m.title);
    const root = await getMediaRoot();
    const baseRoot = `${root}/${contentTypeSubdir('light_novel')}/${authorSafe}/${titleSafe}`;
    const id = await insertSeries({
      contentType: 'light_novel',
      openlibraryId: m.source === 'openlibrary' ? m.sourceId : null,
      isbn: m.isbn ?? null,
      author: m.author ?? null,
      titleEnglish: m.title,
      status: 'finished',
      rootPath: baseRoot,
      qualityProfileId: opts.qualityProfileId,
      coverUrl: m.coverUrl ?? null,
      description: opts.description ?? null,
      totalVolumes: opts.totalVolumes ?? 1,
      granularity: 'volume',
      monitoring: opts.monitoring,
      groupId: opts.groupId ?? null,
    });
    if (m.source === 'googlebooks') {
      await updateSeries(id, { googleBooksVolumeId: m.sourceId });
    }
    await enqueueReleaseSearchOnAdd(id, opts.monitoring);
    await enqueueJob('googlebooks_hydrate', { seriesId: id });
    await enqueueJob('book_series_detect', { seriesId: id });
    kickHydrate(googleBooksHydrateDescriptor, bookSeriesDetectDescriptor);
    return id;
  }

  if (contentType === 'audiobook') {
    const authorSafe = sanitizeForFs(m.author ?? 'Unknown');
    const titleSafe = sanitizeForFs(m.title);
    const root = await getMediaRoot();
    const baseRoot = `${root}/${contentTypeSubdir('audiobook')}/${authorSafe}/${titleSafe}`;
    const id = await insertSeries({
      contentType: 'audiobook',
      asin: opts.asin ?? null,
      author: m.author ?? null,
      narrator: opts.narrator ?? null,
      titleEnglish: m.title,
      status: 'finished',
      rootPath: baseRoot,
      qualityProfileId: opts.qualityProfileId,
      coverUrl: m.coverUrl ?? null,
      description: opts.description ?? null,
      totalVolumes: opts.totalVolumes ?? 1,
      runtimeMinutes: opts.runtimeMinutes ?? null,
      granularity: 'volume',
      monitoring: opts.monitoring,
      groupId: opts.groupId ?? null,
    });
    await enqueueJob('audiobook_hydrate', { seriesId: id });
    await enqueueJob('book_series_detect', { seriesId: id });
    kickHydrate(audiobookHydrateDescriptor, bookSeriesDetectDescriptor);
    return id;
  }

  throw new Error(`createSeriesFromMatch: unsupported contentType "${contentType}"`);
}

// ---------------------------------------------------------------------------
// Find existing series by provider id or title+contentType
// ---------------------------------------------------------------------------

async function findExistingSeries(
  m: Candidate,
  contentType: ContentType,
): Promise<number | null> {
  const db = getDb();

  // 1. By provider id (strongest signal)
  if (m.source === 'openlibrary') {
    const rows = await db
      .select({ id: series.id })
      .from(series)
      .where(eq(series.openlibraryId, m.sourceId))
      .limit(1);
    if (rows[0]) return rows[0].id;
  } else if (m.source === 'googlebooks') {
    const rows = await db
      .select({ id: series.id })
      .from(series)
      .where(eq(series.googleBooksVolumeId, m.sourceId))
      .limit(1);
    if (rows[0]) return rows[0].id;
  }

  // 2. Fallback: titleEnglish + contentType
  const rows = await db
    .select({ id: series.id })
    .from(series)
    .where(and(eq(series.titleEnglish, m.title), eq(series.contentType, contentType)))
    .limit(1);
  return rows[0]?.id ?? null;
}

// ---------------------------------------------------------------------------
// Batch adopt
// ---------------------------------------------------------------------------

/**
 * For each AdoptRow:
 *   1. Find (or create) the series via provider id / title+contentType.
 *   2. Ensure volume 1 exists.
 *   3. For each file: skip if already tracked; else insertLibraryFile.
 *   4. Reconcile monitoring (updateSeries if it differs from row.monitor).
 *
 * Fully idempotent — re-running the same rows adopts nothing new.
 *
 * Rows whose contentType is unsupported (manga/comic) or that throw for any
 * reason are skipped rather than aborting the batch. They appear in `skipped`.
 *
 * Returns:
 *   imported  — number of new library_file rows created across all rows.
 *   seriesIds — deduplicated list of series ids touched.
 *   skipped   — rows that were not adopted, with a reason per row.
 */
export async function adoptImportRows(rows: AdoptRow[]): Promise<{
  imported: number;
  seriesIds: number[];
  skipped: { path: string; reason: string }[];
}> {
  let imported = 0;
  const seriesIdSet = new Set<number>();
  const skipped: { path: string; reason: string }[] = [];

  for (const row of rows) {
    try {
      const monitoring: 'all' | 'none' = row.monitor ? 'all' : 'none';

      // ── 1. Resolve or create the series ──────────────────────────────────
      let seriesId = await findExistingSeries(row.match, row.item.contentType);
      if (seriesId === null) {
        seriesId = await createSeriesFromMatch(row.match, row.item.contentType, {
          qualityProfileId: row.qualityProfileId,
          monitoring,
        });
      }
      seriesIdSet.add(seriesId);

      // ── 2. Ensure volume 1 exists ────────────────────────────────────────
      const vols = await listVolumesBySeries(seriesId);
      let volumeId: number;
      const vol1 = vols.find((v) => v.number === 1);
      if (vol1) {
        volumeId = vol1.id;
      } else {
        volumeId = await insertVolume({ seriesId, number: 1 });
      }

      // ── 3. Adopt each file (idempotent) ──────────────────────────────────
      for (const filePath of row.item.files) {
        const existing = await getLibraryFileByPath(filePath);
        if (existing) continue; // already tracked
        // TODO: for multi-file items sizeBytes is the item total — Candidate exposes no per-file size.
        await insertLibraryFile({
          seriesId,
          volumeId,
          path: filePath,
          sizeBytes: row.item.sizeBytes,
          sourceReleaseId: null,
        });
        imported++;
      }

      // ── 4. Reconcile monitoring ───────────────────────────────────────────
      // Intentionally normalizes any monitoring value (incl. 'future'/'missing') to the grid's binary all/none.
      const seriesRow = await getDb()
        .select({ monitoring: series.monitoring })
        .from(series)
        .where(eq(series.id, seriesId))
        .limit(1);
      const currentMonitoring = seriesRow[0]?.monitoring;
      const targetMonitoring: 'all' | 'none' = row.monitor ? 'all' : 'none';
      if (currentMonitoring !== targetMonitoring) {
        await updateSeries(seriesId, { monitoring: targetMonitoring });
      }
    } catch (err) {
      skipped.push({
        path: row.item.path,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { imported, seriesIds: Array.from(seriesIdSet), skipped };
}
