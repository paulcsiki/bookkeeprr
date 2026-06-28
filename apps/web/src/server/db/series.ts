import { and, asc, desc, eq, gte, inArray, isNotNull, like, sql } from 'drizzle-orm';
import { getDb } from './client';
import { downloads, libraryFiles, releases, series, volumes, type SeriesRow } from './schema';
import { withWriteLock } from './write-lock';
import { purgeCachedImages } from '@/server/images/cache';
import { shouldAutoDisableFutureMonitoring } from '@/server/series/auto-monitoring';
import { sanitizeDescription } from '@/lib/sanitize-description';
import type { ContentType } from '@/server/content-type';

export type SeriesCreate = {
  contentType?: ContentType;
  anilistId?: number | null;
  malId?: number | null;
  comicvineId?: number | null;
  publisher?: string | null;
  startYear?: number | null;
  pageCount?: number | null;
  runtimeMinutes?: number | null;
  author?: string | null;
  openlibraryId?: string | null;
  isbn?: string | null;
  asin?: string | null;
  narrator?: string | null;
  novelUpdatesSlug?: string | null;
  novelUpdatesId?: number | null;
  status: 'releasing' | 'finished' | 'hiatus' | 'cancelled';
  rootPath: string;
  qualityProfileId: number;
  mangadexId?: string | null;
  titleEnglish?: string | null;
  titleRomaji?: string | null;
  titleNative?: string | null;
  coverUrl?: string | null;
  description?: string | null;
  totalVolumes?: number | null;
  totalChapters?: number | null;
  monitoring?: 'none' | 'all' | 'future' | 'missing';
  granularity?: 'volume' | 'chapter';
  extraSearchTermsJson?: string;
  groupId?: number | null;
};

export type SeriesUpdate = Partial<{
  novelUpdatesSlug: string | null;
  novelUpdatesId: number | null;
  author: string | null;
  mangadexId: string | null;
  titleEnglish: string | null;
  titleRomaji: string | null;
  titleNative: string | null;
  status: 'releasing' | 'finished' | 'hiatus' | 'cancelled';
  coverUrl: string | null;
  description: string | null;
  totalVolumes: number | null;
  totalChapters: number | null;
  rootPath: string;
  monitoring: 'none' | 'all' | 'future' | 'missing';
  granularity: 'volume' | 'chapter';
  qualityProfileId: number;
  extraSearchTermsJson: string;
  publisher: string | null;
  isbn: string | null;
  pageCount: number | null;
  runtimeMinutes: number | null;
  googleBooksVolumeId: string | null;
  googleBooksQuery: string | null;
  startYear: number | null;
}>;

export async function insertSeries(input: SeriesCreate): Promise<number> {
  return withWriteLock(async () => {
    const [row] = await getDb()
      .insert(series)
      .values({
        contentType: input.contentType ?? 'manga',
        anilistId: input.anilistId ?? null,
        malId: input.malId ?? null,
        comicvineId: input.comicvineId ?? null,
        publisher: input.publisher ?? null,
        startYear: input.startYear ?? null,
        pageCount: input.pageCount ?? null,
        runtimeMinutes: input.runtimeMinutes ?? null,
        author: input.author ?? null,
        openlibraryId: input.openlibraryId ?? null,
        isbn: input.isbn ?? null,
        asin: input.asin ?? null,
        narrator: input.narrator ?? null,
        novelUpdatesSlug: input.novelUpdatesSlug ?? null,
        novelUpdatesId: input.novelUpdatesId ?? null,
        mangadexId: input.mangadexId ?? null,
        titleEnglish: input.titleEnglish ?? null,
        titleRomaji: input.titleRomaji ?? null,
        titleNative: input.titleNative ?? null,
        status: input.status,
        coverUrl: input.coverUrl ?? null,
        description: sanitizeDescription(input.description) ?? null,
        totalVolumes: input.totalVolumes ?? null,
        totalChapters: input.totalChapters ?? null,
        rootPath: input.rootPath,
        monitoring: input.monitoring ?? 'all',
        granularity: input.granularity ?? 'volume',
        qualityProfileId: input.qualityProfileId,
        extraSearchTermsJson: input.extraSearchTermsJson ?? '[]',
        groupId: input.groupId ?? null,
      })
      .returning({ id: series.id });
    if (!row) throw new Error('insertSeries: insert returned no row');
    return row.id;
  });
}

export async function listSeries(): Promise<SeriesRow[]> {
  return getDb().select().from(series);
}

export type ListParams = {
  page: number;
  limit: number;
  sort: 'added_at:desc' | 'added_at:asc' | 'title:asc';
  contentTypes?: ContentType[];
  q?: string;
};

export async function listSeriesPaginated(
  params: ListParams,
): Promise<{ rows: SeriesRow[]; total: number }> {
  const orderClause =
    params.sort === 'added_at:desc'
      ? desc(series.addedAt)
      : params.sort === 'added_at:asc'
        ? asc(series.addedAt)
        : asc(series.titleEnglish);
  const offset = (params.page - 1) * params.limit;
  const filters = [];
  if (params.contentTypes && params.contentTypes.length > 0) {
    filters.push(inArray(series.contentType, params.contentTypes));
  }
  const q = params.q?.trim();
  if (q) {
    // SQLite LIKE is case-insensitive for ASCII.
    filters.push(like(series.titleEnglish, `%${q}%`));
  }
  const whereClause = filters.length > 0 ? and(...filters) : undefined;
  const baseSelect = getDb().select().from(series);
  const baseCount = getDb()
    .select({ count: sql<number>`count(*)` })
    .from(series);
  const [rows, totalRow] = await Promise.all([
    whereClause
      ? baseSelect.where(whereClause).orderBy(orderClause).limit(params.limit).offset(offset)
      : baseSelect.orderBy(orderClause).limit(params.limit).offset(offset),
    whereClause ? baseCount.where(whereClause) : baseCount,
  ]);
  return { rows, total: Number(totalRow[0]?.count ?? 0) };
}

export async function getSeries(id: number): Promise<SeriesRow | null> {
  const rows = await getDb().select().from(series).where(eq(series.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateSeries(id: number, patch: SeriesUpdate): Promise<void> {
  // Sanitize description on the way in so every stored description is clean
  // regardless of which integration wrote it (strips provider HTML, leaked
  // download links, and backslash line-escapes).
  const clean: SeriesUpdate =
    typeof patch.description === 'string'
      ? { ...patch, description: sanitizeDescription(patch.description) }
      : patch;
  if (Object.keys(clean).length === 0) return;
  await withWriteLock(() =>
    getDb()
      .update(series)
      .set({ ...clean, updatedAt: new Date() })
      .where(eq(series.id, id)),
  );
}

/** Read `metadataJson.coverUrl` off a volume row; null when absent/malformed. */
function volumeCoverUrl(metadataJson: string): string | null {
  try {
    const meta = JSON.parse(metadataJson) as Record<string, unknown>;
    return typeof meta?.coverUrl === 'string' ? meta.coverUrl : null;
  } catch {
    return null;
  }
}

export async function deleteSeries(id: number): Promise<void> {
  // Gather the series' + its volumes' cached cover URLs before the cascade
  // delete removes the rows, so we can purge their on-disk cache files after.
  // Chapters carry no cover art (no cover column), so the series + volumes cover
  // everything cached for this series.
  const db = getDb();
  const [seriesRow, volumeRows] = await Promise.all([
    db.select({ coverUrl: series.coverUrl }).from(series).where(eq(series.id, id)).limit(1),
    db.select({ metadataJson: volumes.metadataJson }).from(volumes).where(eq(volumes.seriesId, id)),
  ]);
  const coverUrls: (string | null)[] = [
    seriesRow[0]?.coverUrl ?? null,
    ...volumeRows.map((v) => volumeCoverUrl(v.metadataJson)),
  ];

  await withWriteLock(() => getDb().delete(series).where(eq(series.id, id)));

  // Best-effort: a purge failure must never fail the delete.
  await purgeCachedImages(coverUrls);
}

export type SeriesMetadataPatch = Partial<{
  titleEnglish: string | null;
  titleRomaji: string | null;
  titleNative: string | null;
  status: 'releasing' | 'finished' | 'hiatus' | 'cancelled';
  coverUrl: string | null;
  description: string | null;
  totalVolumes: number | null;
  totalChapters: number | null;
  mangadexId: string | null;
  comicvineId: number | null;
}>;

export async function updateSeriesMetadata(id: number, patch: SeriesMetadataPatch): Promise<void> {
  await updateSeries(id, patch);
  // A metadata update can reveal that the series can no longer get a future
  // release (it just became finished/cancelled, or its volume count resolved to
  // a single book). In that case a `future` monitor is pointless — drop it to
  // `none`. Re-read so the decision uses the merged row, not just the patch.
  const fresh = await getSeries(id);
  if (fresh && shouldAutoDisableFutureMonitoring(fresh)) {
    await updateSeries(id, { monitoring: 'none' });
  }
}

/**
 * Sweep every series and drop eligible `future` → `none` (see
 * {@link shouldAutoDisableFutureMonitoring}). Returns the number changed. Runs
 * from housekeeping so series that became finished/single before the metadata
 * hook existed get reconciled too.
 */
export async function reconcileFutureMonitoring(): Promise<number> {
  const all = await listAllSeries();
  let changed = 0;
  for (const s of all) {
    if (shouldAutoDisableFutureMonitoring(s)) {
      await updateSeries(s.id, { monitoring: 'none' });
      changed++;
    }
  }
  return changed;
}

export async function getSeriesByAniListId(anilistId: number): Promise<SeriesRow | null> {
  const rows = await getDb().select().from(series).where(eq(series.anilistId, anilistId)).limit(1);
  return rows[0] ?? null;
}

export async function getSeriesByMalId(malId: number): Promise<SeriesRow | null> {
  const rows = await getDb().select().from(series).where(eq(series.malId, malId)).limit(1);
  return rows[0] ?? null;
}

export async function listMonitoredSeries(
  monitoring: ('none' | 'all' | 'future' | 'missing')[] = ['all', 'future', 'missing'],
): Promise<SeriesRow[]> {
  return getDb().select().from(series).where(inArray(series.monitoring, monitoring));
}

export async function listAllSeries(): Promise<SeriesRow[]> {
  return getDb().select().from(series).orderBy(desc(series.addedAt));
}

export type AcquisitionCounts = { owned: number; total: number };

/**
 * On-disk size (sum of imported library-file bytes) per series, for the whole
 * library at once. Series with no imported files are simply absent from the map.
 */
export async function getSeriesDiskSizes(): Promise<Map<number, number>> {
  const rows = await getDb()
    .select({ seriesId: libraryFiles.seriesId, bytes: sql<number>`sum(${libraryFiles.sizeBytes})` })
    .from(libraryFiles)
    .groupBy(libraryFiles.seriesId);
  const out = new Map<number, number>();
  for (const r of rows) out.set(r.seriesId, Number(r.bytes ?? 0));
  return out;
}

/**
 * Acquisition aggregate per series, for the whole library at once.
 *
 * - `owned` = number of distinct volumes that have ≥1 `library_files` row
 *   linking to them via `library_files.volumeId`.
 * - `total` = `series.totalVolumes` when set (> 0), else the count of
 *   `volumes` rows for that series.
 *
 * Two grouped queries (volume counts per series, owned-volume counts per
 * series) are merged in memory so the result covers every series with a `0/0`
 * default — callers can look up any series id and get a sensible answer.
 */
export async function getAcquisitionCounts(): Promise<Map<number, AcquisitionCounts>> {
  const db = getDb();

  const [seriesRows, volumeRows, ownedRows] = await Promise.all([
    db.select({ id: series.id, totalVolumes: series.totalVolumes }).from(series),
    db
      .select({ seriesId: volumes.seriesId, total: sql<number>`count(*)` })
      .from(volumes)
      .groupBy(volumes.seriesId),
    db
      .select({
        seriesId: volumes.seriesId,
        owned: sql<number>`count(distinct ${volumes.id})`,
      })
      .from(libraryFiles)
      .innerJoin(volumes, eq(libraryFiles.volumeId, volumes.id))
      .groupBy(volumes.seriesId),
  ]);

  const volumeTotals = new Map<number, number>();
  for (const r of volumeRows) volumeTotals.set(r.seriesId, Number(r.total));

  const ownedCounts = new Map<number, number>();
  for (const r of ownedRows) ownedCounts.set(r.seriesId, Number(r.owned));

  const out = new Map<number, AcquisitionCounts>();
  for (const s of seriesRows) {
    const total = s.totalVolumes && s.totalVolumes > 0 ? s.totalVolumes : (volumeTotals.get(s.id) ?? 0);
    out.set(s.id, { owned: ownedCounts.get(s.id) ?? 0, total });
  }
  return out;
}

export type SeriesHealth = 'complete' | 'missing' | 'downloading' | 'error';

/**
 * Per-series download health for the library "Health" filter. Priority:
 * error (a failed download) > downloading (a queued/active/importing download) >
 * complete (every volume owned) > missing (some volumes not owned). Downloads
 * link to a series via their release.
 */
export async function getSeriesHealth(): Promise<Map<number, SeriesHealth>> {
  const acq = await getAcquisitionCounts();
  const dlRows = await getDb()
    .select({ seriesId: releases.seriesId, status: downloads.status })
    .from(downloads)
    .innerJoin(releases, eq(downloads.releaseId, releases.id));
  const dl = new Map<number, { downloading: boolean; error: boolean }>();
  for (const r of dlRows) {
    if (r.seriesId == null) continue;
    const cur = dl.get(r.seriesId) ?? { downloading: false, error: false };
    if (r.status === 'failed') cur.error = true;
    else if (r.status === 'queued' || r.status === 'downloading' || r.status === 'importing')
      cur.downloading = true;
    dl.set(r.seriesId, cur);
  }
  const out = new Map<number, SeriesHealth>();
  for (const [sid, c] of acq) {
    const d = dl.get(sid);
    if (d?.error) out.set(sid, 'error');
    else if (d?.downloading) out.set(sid, 'downloading');
    else out.set(sid, c.total > 0 && c.owned >= c.total ? 'complete' : 'missing');
  }
  return out;
}

/**
 * Light-novel series IDs that have a NovelUpdates id set. Used by the M32 NU
 * chapter-sync fanout entry to fan out one chapter-sync job per LN series.
 */
export async function getLnSeriesIdsWithNu(): Promise<number[]> {
  const rows = await getDb()
    .select({ id: series.id })
    .from(series)
    .where(and(eq(series.contentType, 'light_novel'), isNotNull(series.novelUpdatesId)))
    .orderBy(series.id);
  return rows.map((r) => r.id);
}

/**
 * Series IDs that have at least one release. If `cutoff` is provided, only
 * counts releases with `publishedAt >= cutoff`. Used by the matcher replay
 * engine (M31) to narrow scope to series with relevant historical releases.
 */
export async function listSeriesWithRecentReleases(cutoff: Date | null): Promise<SeriesRow[]> {
  const sub = cutoff
    ? getDb()
        .selectDistinct({ id: releases.seriesId })
        .from(releases)
        .where(gte(releases.discoveredAt, cutoff))
    : getDb().selectDistinct({ id: releases.seriesId }).from(releases);
  const ids = (await sub).map((r) => r.id).filter((id): id is number => id !== null);
  if (ids.length === 0) return [];
  return getDb().select().from(series).where(inArray(series.id, ids));
}
