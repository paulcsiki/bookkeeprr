import { z } from 'zod';
import {
  findMangaByTitles,
  getVolumeCovers,
  getChapters,
} from '@/server/integrations/mangadex/client';
import { getSeries, updateSeriesMetadata } from '@/server/db/series';
import {
  insertVolume,
  listVolumesBySeries,
  updateVolume,
  type VolumeUpdate,
} from '@/server/db/volumes';
import {
  searchBooks,
  matchVolumeEdition,
  type VolumeEditionMatch,
} from '@/server/integrations/openlibrary';
import { searchVolumeEdition, pickVolumeEdition, editionYear } from '@/server/integrations/googlebooks';
import { searchVolumes, listIssues, pickComicVineVolume } from '@/server/integrations/comicvine';
import { googleBooksApiKeySetting, googleBooksApiKeyOrNull } from '@/server/db/settings/googlebooks';
import { comicVineApiKeySetting, isComicVineConfigured } from '@/server/db/settings/comicvine';
import { logger } from '@/server/logger';
import type { JobKindDescriptor } from '../types';

const Payload = z.object({ seriesId: z.number().int().positive(), pass: z.number().int().min(0).optional() });

/** Hard ceiling on self-re-enqueue chains, so a series that can never reach full
 * coverage cannot loop forever. ~5 passes × (40 GB + 60 OL) covers 500 volumes. */
const MAX_PASSES = 6;

/**
 * Cap Open Library fallback lookups per run. OL is rate-limited to ~1 req/s, so
 * a large gap list would otherwise dominate the job's wall-clock. When the gap
 * list exceeds this, we process the first N and log how many were skipped (no
 * silent truncation — the remainder is filled on a subsequent run).
 */
const OL_FALLBACK_MAX = 60;

/** Cap Google Books targeted lookups per run. GB is rate-limited ~1 req/s; the
 * job re-enqueues itself to finish remaining gaps over successive passes. */
const GB_FALLBACK_MAX = 40;

function parseMetadata(json: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
  } catch {
    // Corrupt JSON: warn so the impending key loss (we replace with {}) is
    // observable rather than silent.
    logger().warn({ component: 'mangadex_volume_hydrate' }, 'unparseable volume metadataJson; resetting');
  }
  return {};
}

export type MangadexVolumeHydrateResult = {
  volumesAdded: number;
  volumesUpdated: number;
};

/**
 * Hydrates per-volume metadata (title, cover art, release date) for a manga
 * series from MangaDex. Event-driven: chained from metadata_hydrate, not
 * scheduled on a cron.
 *
 * Idempotent: only writes a volume row when a value actually changed, so it is
 * safe to re-run.
 */
export const mangadexVolumeHydrateDescriptor: JobKindDescriptor<
  { seriesId: number; pass?: number },
  MangadexVolumeHydrateResult
> = {
  kind: 'mangadex_volume_hydrate',
  retryPolicy: { maxAttempts: 5 },
  // Worst case per run: up to GB_FALLBACK_MAX (40) sequential ~1 req/s Google
  // Books lookups, then up to OL_FALLBACK_MAX (60) sequential ~1 req/s Open
  // Library lookups, plus the MangaDex calls — well beyond DEFAULT_TIMEOUT_MS
  // (60s). The self re-enqueue means a run that hits the cap is continued later.
  timeoutMs: 120_000,
  handler: async (rawPayload, jobId) => {
    const log = logger().child({ component: 'mangadex_volume_hydrate', jobId });
    const { seriesId, pass = 0 } = Payload.parse(rawPayload);
    const series = await getSeries(seriesId);
    if (!series) {
      log.warn({ seriesId }, 'series not found; skipping');
      return { volumesAdded: 0, volumesUpdated: 0 };
    }

    // Trust an existing mangadexId; only resolve (by validated title match) when
    // missing, and never overwrite — a bad resolve must not mis-link the series.
    let mangadexId = series.mangadexId;
    if (!mangadexId) {
      const md = await findMangaByTitles(
        [series.titleRomaji, series.titleEnglish].filter((t): t is string => Boolean(t)),
      );
      if (!md) {
        log.warn(
          { seriesId, anilistId: series.anilistId },
          'series has no mangadexId and could not resolve one; skipping',
        );
        return { volumesAdded: 0, volumesUpdated: 0 };
      }
      mangadexId = md.mangadexId;
      await updateSeriesMetadata(series.id, { mangadexId });
    }

    const [covers, chapters] = await Promise.all([
      getVolumeCovers(mangadexId),
      getChapters(mangadexId),
    ]);

    const coverByVolume = new Map<number, string>();
    for (const c of covers) coverByVolume.set(c.volume, c.url);

    // Earliest publishAt per volume, derived from chapters.
    const earliestByVolume = new Map<number, Date>();
    for (const ch of chapters) {
      if (ch.volume == null || ch.publishAt == null) continue;
      const cur = earliestByVolume.get(ch.volume);
      if (!cur || ch.publishAt.getTime() < cur.getTime()) {
        earliestByVolume.set(ch.volume, ch.publishAt);
      }
    }

    // Target volume numbers: 1..totalVolumes (when known) plus any cover volumes.
    const targetNumbers = new Set<number>();
    if (series.totalVolumes && series.totalVolumes > 0) {
      for (let n = 1; n <= series.totalVolumes; n++) targetNumbers.add(n);
    }
    for (const n of coverByVolume.keys()) targetNumbers.add(n);

    const existing = await listVolumesBySeries(series.id);
    const existingByNumber = new Map(existing.map((v) => [v.number, v]));

    const sortedTargets = [...targetNumbers].sort((a, b) => a - b);

    // --- Cover-source consistency --------------------------------------------
    // When Google Books already supplies the MAJORITY of this series' covers,
    // prefer it for every volume — re-fetching the odd ones out (a lone MangaDex
    // JP cover, a stray OL/CV cover) from GB — so the shelf reads as one edition
    // instead of a mix. Gated on GB-dominance, so a series whose covers come
    // mainly from MangaDex (or anything else) is left exactly as-is.
    let gbCovered = 0;
    let otherCovered = 0;
    for (const v of existing) {
      const meta = parseMetadata(v.metadataJson);
      if (typeof meta.coverUrl !== 'string') continue;
      if (meta.coverSource === 'googlebooks') gbCovered++;
      else otherCovered++;
    }
    const preferGb = gbCovered >= 3 && gbCovered > otherCovered;
    if (preferGb && otherCovered > 0) {
      log.info(
        { seriesId: series.id, gbCovered, otherCovered },
        'google books is the dominant cover source; unifying outlier volumes',
      );
    }

    // --- Google Books cover pass (MangaDex → Google Books → Open Library) --------
    // MangaDex entries for many manga have sparse volume covers; Google Books has
    // clean per-volume covers for most VIZ/print releases. Fill gaps here before
    // the noisier Open Library fallback.
    const gbCoverByVolume = new Map<number, string>();
    const gbYearByVolume = new Map<number, number>();
    const gbMatchByVolume = new Map<number, { id: string; isbn: string | null }>();
    const queryTitleForGb = series.titleEnglish ?? series.titleRomaji;
    if (queryTitleForGb) {
      const apiKey = googleBooksApiKeyOrNull(await googleBooksApiKeySetting.get());
      // A volume is a Google Books gap when it still lacks a cover, OR lacks both
      // a precise date and a stored year (Google Books editions carry a
      // publishedDate we can mine for the release year). The existing-row check
      // matters: without it every pass re-spends its lookup budget on the same
      // already-complete low volumes, gains nothing, and the re-enqueue guard
      // halts before the real gaps are reached (left Bleach 42-72 blank). A
      // fully-complete volume (cover + date/year) is skipped entirely.
      const gbGaps = sortedTargets.filter((n) => {
        const row = existingByNumber.get(n);
        const meta = row ? parseMetadata(row.metadataJson) : {};
        const hasCover = coverByVolume.has(n) || typeof meta.coverUrl === 'string';
        const resolvedDate = earliestByVolume.get(n) ?? row?.releaseDate ?? null;
        const hasYear = typeof meta.releaseYear === 'number';
        // When GB is the chosen consistent source, a volume whose cover came from
        // a different source (or this run's MangaDex map) is also a gap — we want
        // to re-source it from GB so the set is uniform.
        const nonGbCover =
          preferGb &&
          ((typeof meta.coverUrl === 'string' && meta.coverSource !== 'googlebooks') ||
            (coverByVolume.has(n) && meta.coverSource !== 'googlebooks'));
        return !hasCover || nonGbCover || (resolvedDate == null && !hasYear);
      });
      const gbToLookUp = gbGaps.slice(0, GB_FALLBACK_MAX);
      if (gbGaps.length > GB_FALLBACK_MAX) {
        log.info(
          { seriesId: series.id, gaps: gbGaps.length, cap: GB_FALLBACK_MAX, skipped: gbGaps.length - GB_FALLBACK_MAX },
          'google books cap reached; deferring remaining gaps to a re-enqueued run',
        );
      }
      for (const n of gbToLookUp) {
        try {
          const candidates = await searchVolumeEdition(queryTitleForGb, n, apiKey);
          const best = pickVolumeEdition(candidates, queryTitleForGb, n, { allowComicCategories: true });
          if (best) {
            const y = editionYear(best);
            if (y != null) gbYearByVolume.set(n, y);
            if (best.coverUrl) {
              gbCoverByVolume.set(n, best.coverUrl);
              gbMatchByVolume.set(n, { id: best.id, isbn: best.isbn });
            }
          }
        } catch (err) {
          log.warn(
            { seriesId: series.id, volume: n, err: err instanceof Error ? err.message : String(err) },
            'google books lookup failed; continuing',
          );
        }
      }
    }
    // ---------------------------------------------------------------------

    // --- ComicVine fallback pass (covers + dates GB/MangaDex lack) -----------
    // ComicVine indexes per-volume ("issue") covers + cover dates for the
    // English print run, including late volumes Google Books only catalogs
    // without an image (e.g. Bleach 70-72). Fill remaining gaps from here before
    // the noisier Open Library fallback.
    const cvCoverByVolume = new Map<number, string>();
    const cvYearByVolume = new Map<number, number>();
    if (series.contentType === 'manga' || series.contentType === 'comic') {
      const cvKey = await comicVineApiKeySetting.get();
      const cvGaps = sortedTargets.filter((n) => {
        const row = existingByNumber.get(n);
        const meta = row ? parseMetadata(row.metadataJson) : {};
        const hasCover =
          coverByVolume.has(n) || gbCoverByVolume.has(n) || typeof meta.coverUrl === 'string';
        const resolvedDate = earliestByVolume.get(n) ?? row?.releaseDate ?? null;
        const hasYear = typeof meta.releaseYear === 'number' || gbYearByVolume.has(n);
        return !hasCover || (resolvedDate == null && !hasYear);
      });
      if (isComicVineConfigured(cvKey) && cvGaps.length > 0) {
        try {
          // Resolve (and cache on the series) the ComicVine volume id once.
          let cvId = series.comicvineId;
          if (cvId == null) {
            const title = series.titleEnglish ?? series.titleRomaji;
            if (title) {
              const hits = await searchVolumes(cvKey, title);
              const picked = pickComicVineVolume(hits, title, series.totalVolumes ?? null);
              if (picked) {
                cvId = picked.comicvineId;
                await updateSeriesMetadata(series.id, { comicvineId: cvId });
              }
            }
          }
          if (cvId != null) {
            const issues = await listIssues(cvKey, cvId);
            for (const iss of issues) {
              const n = parseInt(iss.issueNumber, 10);
              if (!Number.isInteger(n)) continue;
              if (iss.coverUrl && !cvCoverByVolume.has(n)) cvCoverByVolume.set(n, iss.coverUrl);
              if (iss.coverDate && !cvYearByVolume.has(n)) {
                const m = /(\d{4})/.exec(iss.coverDate);
                const y = m ? parseInt(m[1]!, 10) : NaN;
                if (y >= 1900 && y <= 2100) cvYearByVolume.set(n, y);
              }
            }
          }
        } catch (err) {
          log.warn(
            { seriesId: series.id, err: err instanceof Error ? err.message : String(err) },
            'comicvine fallback failed; continuing',
          );
        }
      }
    }
    // ---------------------------------------------------------------------

    // --- Open Library fallback pass ---------------------------------------
    // Fill volumes MangaDex couldn't cover/date from the English print edition
    // on Open Library. MangaDex always wins; OL only fills genuine gaps.
    const olCoverByVolume = new Map<number, string>();
    const olYearByVolume = new Map<number, number>();
    const olMatchByVolume = new Map<number, VolumeEditionMatch>();

    const seriesTitles = [series.titleEnglish, series.titleRomaji].filter(
      (t): t is string => Boolean(t),
    );

    if (seriesTitles.length > 0) {
      // A volume is a "gap" when, after MangaDex + Google Books + ComicVine and
      // the existing row, it still lacks a cover, OR has neither a precise date
      // nor a stored/derived year. OL is the last, noisiest fallback.
      const gaps = sortedTargets.filter((n) => {
        const row = existingByNumber.get(n);
        const meta = row ? parseMetadata(row.metadataJson) : {};
        const hasCover =
          coverByVolume.has(n) ||
          gbCoverByVolume.has(n) ||
          cvCoverByVolume.has(n) ||
          typeof meta.coverUrl === 'string';
        const resolvedDate = earliestByVolume.get(n) ?? row?.releaseDate ?? null;
        const hasYear =
          typeof meta.releaseYear === 'number' ||
          gbYearByVolume.has(n) ||
          cvYearByVolume.has(n);
        return !hasCover || (resolvedDate == null && !hasYear);
      });

      const toLookUp = gaps.slice(0, OL_FALLBACK_MAX);
      if (gaps.length > OL_FALLBACK_MAX) {
        log.info(
          { seriesId: series.id, gaps: gaps.length, cap: OL_FALLBACK_MAX, skipped: gaps.length - OL_FALLBACK_MAX },
          'open library fallback cap reached; deferring remaining gaps to a later run',
        );
      }

      const queryTitle = series.titleEnglish ?? series.titleRomaji;
      for (const n of toLookUp) {
        try {
          const hits = await searchBooks(`${queryTitle} vol ${n}`);
          const match = matchVolumeEdition(hits, { seriesTitles, volumeNumber: n });
          if (!match) continue;
          if (match.coverUrl) olCoverByVolume.set(n, match.coverUrl);
          if (match.year != null) olYearByVolume.set(n, match.year);
          // Stash olid/isbn alongside so future passes/UI can use them.
          if (match.coverUrl || match.year != null) {
            olMatchByVolume.set(n, match);
          }
        } catch (err) {
          log.warn(
            { seriesId: series.id, volume: n, err: err instanceof Error ? err.message : String(err) },
            'open library lookup failed; continuing',
          );
        }
      }
    }
    // ---------------------------------------------------------------------

    let volumesAdded = 0;
    let volumesUpdated = 0;
    // Count rows that GAIN a cover they did not previously have this run; drives
    // the self re-enqueue decision (only continue when we made cover progress).
    let coversAddedThisRun = 0;
    // Count rows that GAIN a release year this run. A series whose covers are all
    // filled but whose years are still trickling in must keep re-enqueueing, so
    // year progress also keeps the backfill chain alive.
    let yearsAddedThisRun = 0;

    for (const n of sortedTargets) {
      const coverUrl = coverByVolume.get(n);
      const earliest = earliestByVolume.get(n) ?? null;
      const olCover = olCoverByVolume.get(n);
      const olYear = olYearByVolume.get(n);
      const olMatch = olMatchByVolume.get(n);
      const gbCover = gbCoverByVolume.get(n);
      const gbMatch = gbMatchByVolume.get(n);
      const gbYear = gbYearByVolume.get(n);
      const cvCover = cvCoverByVolume.get(n);
      const cvYear = cvYearByVolume.get(n);
      // Year preference: Google Books (publishedDate) → ComicVine (cover_date) →
      // Open Library. Only used when there's no precise release date.
      const resolvedYear = gbYear ?? cvYear ?? olYear;
      const row = existingByNumber.get(n);

      if (!row) {
        // Create the row with all derived values in one insert.
        const meta: Record<string, unknown> = {};
        if (coverUrl) {
          // MangaDex cover: leave coverSource implicit to keep metadata minimal.
          meta.coverUrl = coverUrl;
        } else if (gbCover) {
          meta.coverUrl = gbCover;
          meta.coverSource = 'googlebooks';
          if (gbMatch?.id) meta.googleBooksVolumeId = gbMatch.id;
          if (gbMatch?.isbn) meta.isbn = gbMatch.isbn;
        } else if (cvCover) {
          meta.coverUrl = cvCover;
          meta.coverSource = 'comicvine';
        } else if (olCover) {
          meta.coverUrl = olCover;
          meta.coverSource = 'openlibrary';
        }
        // Year only matters when there's no precise date for this volume.
        if (earliest == null && resolvedYear != null) {
          meta.releaseYear = resolvedYear;
          yearsAddedThisRun++;
        }
        if (olMatch?.olid) meta.olid = olMatch.olid;
        if (olMatch?.isbn) meta.isbn = olMatch.isbn;
        await insertVolume({
          seriesId: series.id,
          number: n,
          title: `Volume ${n}`,
          releaseDate: earliest,
          metadataJson: Object.keys(meta).length > 0 ? JSON.stringify(meta) : '{}',
        });
        volumesAdded++;
        if (typeof meta.coverUrl === 'string') coversAddedThisRun++;
        continue;
      }

      // Update existing row only with values that actually change.
      const patch: VolumeUpdate = {};
      if (row.title !== `Volume ${n}`) patch.title = `Volume ${n}`;

      const metadata = parseMetadata(row.metadataJson);
      const hadCover = typeof metadata.coverUrl === 'string';
      const nextMeta = { ...metadata };
      let metaChanged = false;

      if (preferGb && gbCover) {
        // Google Books is the series' dominant source: it wins over MangaDex and
        // everything else so the covers stay one consistent edition.
        if (nextMeta.coverUrl !== gbCover) {
          nextMeta.coverUrl = gbCover;
          metaChanged = true;
        }
        if (nextMeta.coverSource !== 'googlebooks') {
          nextMeta.coverSource = 'googlebooks';
          metaChanged = true;
        }
        if (gbMatch?.id) nextMeta.googleBooksVolumeId = gbMatch.id;
        if (gbMatch?.isbn) nextMeta.isbn = gbMatch.isbn;
      } else if (coverUrl) {
        // MangaDex cover wins. Set it, but don't churn an already-correct row.
        if (nextMeta.coverUrl !== coverUrl) {
          nextMeta.coverUrl = coverUrl;
          metaChanged = true;
        }
        // If this cover previously came from a fallback source, drop the now-stale
        // attribution (keep olid/isbn/googleBooksVolumeId — the edition identity
        // is still valid).
        if (
          nextMeta.coverSource === 'openlibrary' ||
          nextMeta.coverSource === 'googlebooks' ||
          nextMeta.coverSource === 'comicvine'
        ) {
          delete nextMeta.coverSource;
          metaChanged = true;
        }
      } else if (gbCover && nextMeta.coverUrl == null) {
        // GB fills only when there's no MangaDex cover AND no existing cover.
        nextMeta.coverUrl = gbCover;
        nextMeta.coverSource = 'googlebooks';
        if (gbMatch?.id) nextMeta.googleBooksVolumeId = gbMatch.id;
        if (gbMatch?.isbn) nextMeta.isbn = gbMatch.isbn;
        metaChanged = true;
      } else if (cvCover && nextMeta.coverUrl == null) {
        // ComicVine fills when there's no MangaDex/GB cover AND no existing cover.
        nextMeta.coverUrl = cvCover;
        nextMeta.coverSource = 'comicvine';
        metaChanged = true;
      } else if (olCover && nextMeta.coverUrl == null) {
        // OL fills only when there's no MangaDex/GB cover AND no existing cover.
        nextMeta.coverUrl = olCover;
        nextMeta.coverSource = 'openlibrary';
        if (olMatch?.olid) nextMeta.olid = olMatch.olid;
        if (olMatch?.isbn) nextMeta.isbn = olMatch.isbn;
        metaChanged = true;
      }

      // releaseYear only when no precise date exists (column or earliest chapter)
      // and no year is already stored.
      const existingYear = typeof nextMeta.releaseYear === 'number' ? nextMeta.releaseYear : null;
      if (
        row.releaseDate == null &&
        earliest == null &&
        existingYear == null &&
        resolvedYear != null
      ) {
        nextMeta.releaseYear = resolvedYear;
        metaChanged = true;
        yearsAddedThisRun++;
      }

      // Count only a newly-gained cover (had none before, has one now).
      if (!hadCover && typeof nextMeta.coverUrl === 'string') coversAddedThisRun++;

      if (metaChanged) patch.metadataJson = JSON.stringify(nextMeta);

      // Only set releaseDate when currently null (don't overwrite).
      if (row.releaseDate == null && earliest != null) {
        patch.releaseDate = earliest;
      }

      if (Object.keys(patch).length > 0) {
        await updateVolume(row.id, patch);
        volumesUpdated++;
      }
    }

    // Self re-enqueue (short delay) while still making progress (a newly-gained
    // cover OR year) and gaps remain, bounded by MAX_PASSES so an unfillable
    // series can't loop forever. A gap is a volume missing its cover, or missing
    // both a precise date and a stored year.
    const finalVolumes = await listVolumesBySeries(series.id);
    const finalByNumber = new Map(finalVolumes.map((v) => [v.number, v]));
    const stillMissing = [...targetNumbers].filter((n) => {
      const row = finalByNumber.get(n);
      if (!row) return true;
      const meta = parseMetadata(row.metadataJson);
      if (typeof meta.coverUrl !== 'string') return true;
      const hasYear = typeof meta.releaseYear === 'number';
      return row.releaseDate == null && !hasYear;
    });
    const madeProgress = coversAddedThisRun > 0 || yearsAddedThisRun > 0;
    if (stillMissing.length > 0 && madeProgress && pass < MAX_PASSES) {
      const { enqueueJob } = await import('@/server/db/jobs');
      await enqueueJob(
        'mangadex_volume_hydrate',
        { seriesId: series.id, pass: pass + 1 },
        new Date(Date.now() + 5_000),
      );
      log.info(
        { seriesId: series.id, stillMissing: stillMissing.length, nextPass: pass + 1 },
        're-enqueued to continue cover backfill',
      );
    }

    log.info({ seriesId: series.id, volumesAdded, volumesUpdated }, 'volume hydrate complete');
    return { volumesAdded, volumesUpdated };
  },
};
