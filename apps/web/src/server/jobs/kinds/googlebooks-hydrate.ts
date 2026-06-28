import { z } from 'zod';
import { getSeries, updateSeries, type SeriesUpdate } from '@/server/db/series';
import {
  insertVolume,
  listVolumesBySeries,
  updateVolume,
  type VolumeUpdate,
} from '@/server/db/volumes';
import {
  searchSeriesVolumes,
  searchVolumeEdition,
  deriveSeriesFromEditions,
  pickVolumeEdition,
} from '@/server/integrations/googlebooks';
import { searchBooks, matchVolumeEdition, coverUrlByIsbn } from '@/server/integrations/openlibrary';
import { googleBooksApiKeySetting, googleBooksApiKeyOrNull } from '@/server/db/settings/googlebooks';
import { logger } from '@/server/logger';
import type { JobKindDescriptor } from '../types';
import { DEFAULT_RETRY_POLICY, DEFAULT_TIMEOUT_MS } from '../types';

/**
 * Cap Open Library fallback lookups per run. OL is rate-limited, so a large
 * gap list would otherwise dominate the job's wall-clock. When the gap list
 * exceeds this, we process the first N and log how many were skipped.
 */
const OL_FALLBACK_MAX = 20;

/**
 * Cap targeted Google Books lookups per run to avoid overwhelming the API.
 */
const GB_TARGETED_MAX = 15;

const Payload = z.object({ seriesId: z.number().int().positive() });

export type GoogleBooksHydrateResult = {
  seriesId: number;
  totalVolumes: number | null;
  volumesAdded: number;
  volumesUpdated: number;
};

/** Serialize with sorted keys so re-runs that rebuild the object (and thus may
 * reorder keys) still produce a byte-identical string — preserving idempotency. */
function stableStringify(o: Record<string, unknown>): string {
  return JSON.stringify(o, Object.keys(o).sort());
}

function parseMeta(json: string): Record<string, unknown> {
  try {
    const v = JSON.parse(json) as unknown;
    if (v && typeof v === 'object') return v as Record<string, unknown>;
  } catch {
    // fall through
  }
  return {};
}

type CoverEntry = {
  url: string;
  source: 'googlebooks' | 'openlibrary';
  olid?: string;
  isbn?: string | null;
};

type MetaEntry = {
  title?: string;
  description?: string | null;
  pageCount?: number | null;
  googleBooksVolumeId?: string;
  isbn?: string | null;
};

export const googleBooksHydrateDescriptor: JobKindDescriptor<
  { seriesId: number },
  GoogleBooksHydrateResult
> = {
  kind: 'googlebooks_hydrate',
  retryPolicy: DEFAULT_RETRY_POLICY,
  timeoutMs: DEFAULT_TIMEOUT_MS * 5,
  handler: async (raw) => {
    const log = logger().child({ component: 'googlebooks_hydrate' });
    const { seriesId } = Payload.parse(raw);
    const series = await getSeries(seriesId);
    const empty: GoogleBooksHydrateResult = { seriesId, totalVolumes: null, volumesAdded: 0, volumesUpdated: 0 };
    if (!series) return empty;
    if (series.contentType !== 'light_novel') return empty;

    const title = series.titleEnglish ?? series.titleRomaji ?? series.titleNative;
    if (!title) return empty;

    const apiKey = googleBooksApiKeyOrNull(await googleBooksApiKeySetting.get());

    let derived;
    try {
      derived = deriveSeriesFromEditions(
        await searchSeriesVolumes(title, series.publisher, apiKey),
        title,
      );
      // A stored publisher can be too specific — Google Books splits a series'
      // editions across imprints (e.g. "Yen On" vs "Yen Press LLC"), so an
      // inpublisher: filter can starve the result set. Retry title-only when the
      // publisher-filtered query yields too few volumes to be confident.
      if (!derived && series.publisher) {
        derived = deriveSeriesFromEditions(
          await searchSeriesVolumes(title, null, apiKey),
          title,
        );
      }
    } catch (err) {
      log.warn({ seriesId, err: (err as Error).message }, 'google books search failed');
      return empty;
    }

    if (!derived) {
      log.info({ seriesId }, 'google books: low confidence, no-op');
      return empty;
    }

    // --- Series patch ---
    // The series anchor uses the lowest-numbered derived volume (volumes is sorted ascending
    // and guaranteed length>=2 by deriveSeriesFromEditions), matching the "volume-1, fall back
    // to lowest" rule.
    const anchorId = derived.volumes[0]!.googleBooksVolumeId;
    const patch: SeriesUpdate = {};
    if (series.googleBooksVolumeId !== anchorId) patch.googleBooksVolumeId = anchorId;
    if (series.googleBooksQuery !== title) patch.googleBooksQuery = title;
    if (series.totalVolumes === null || derived.totalVolumes > series.totalVolumes) {
      patch.totalVolumes = derived.totalVolumes;
    }
    if (derived.seriesCoverUrl && series.coverUrl !== derived.seriesCoverUrl) patch.coverUrl = derived.seriesCoverUrl; // always replace for novels
    if (series.description === null && derived.seriesDescription) {
      patch.description = derived.seriesDescription;
    }
    if (series.publisher === null && derived.publisher) patch.publisher = derived.publisher;
    if (Object.keys(patch).length > 0) await updateSeries(seriesId, patch);

    // --- effectiveTotal: loop the larger of stored/derived totals ---
    const effectiveTotal = patch.totalVolumes ?? series.totalVolumes ?? derived.totalVolumes;

    // --- Seed coverByNumber and metaByNumber from broad-search derived volumes ---
    const coverByNumber = new Map<number, CoverEntry>();
    const metaByNumber = new Map<number, MetaEntry>();

    for (const v of derived.volumes) {
      if (v.coverUrl) {
        coverByNumber.set(v.number, { url: v.coverUrl, source: 'googlebooks' });
      }
      metaByNumber.set(v.number, {
        title: v.title,
        description: v.description,
        pageCount: v.pageCount,
        googleBooksVolumeId: v.googleBooksVolumeId,
        isbn: v.isbn,
      });
    }

    // --- Targeted GB pass: fill gaps from broad search ---
    const gbGaps: number[] = [];
    for (let n = 1; n <= effectiveTotal; n++) {
      if (!coverByNumber.has(n)) gbGaps.push(n);
    }

    const gbToLookUp = gbGaps.slice(0, GB_TARGETED_MAX);
    if (gbGaps.length > GB_TARGETED_MAX) {
      log.info(
        { seriesId, gaps: gbGaps.length, cap: GB_TARGETED_MAX, skipped: gbGaps.length - GB_TARGETED_MAX },
        'targeted google books cap reached; deferring remaining gaps to a later run',
      );
    }

    for (const n of gbToLookUp) {
      try {
        const candidates = await searchVolumeEdition(title, n, apiKey);
        const best = pickVolumeEdition(candidates, title, n);
        if (!best) continue;
        coverByNumber.set(n, { url: best.coverUrl!, source: 'googlebooks' });
        // Only fill meta if not already present from broad search
        if (!metaByNumber.has(n)) {
          metaByNumber.set(n, {
            title: best.title,
            description: best.description,
            pageCount: best.pageCount,
            googleBooksVolumeId: best.id,
          });
        }
      } catch (err) {
        log.warn(
          { seriesId, volume: n, err: err instanceof Error ? err.message : String(err) },
          'targeted google books lookup failed; continuing',
        );
      }
    }

    // --- OL fallback: fill remaining gaps (ISBN probe + title search, combined cap) ---
    const seriesTitles = [series.titleEnglish, series.titleRomaji].filter((t): t is string => Boolean(t));

    // Collect all gaps after targeted GB pass
    const olGapsAll: number[] = [];
    for (let n = 1; n <= effectiveTotal; n++) {
      if (!coverByNumber.has(n)) olGapsAll.push(n);
    }

    const olToLookUp = olGapsAll.slice(0, OL_FALLBACK_MAX);
    if (olGapsAll.length > OL_FALLBACK_MAX) {
      log.info(
        { seriesId, gaps: olGapsAll.length, cap: OL_FALLBACK_MAX, skipped: olGapsAll.length - OL_FALLBACK_MAX },
        'open library fallback cap reached; deferring remaining gaps to a later run',
      );
    }

    for (const n of olToLookUp) {
      // OL-by-ISBN tier: probe directly if we have an ISBN for this volume
      const metaIsbn = metaByNumber.get(n)?.isbn;
      if (metaIsbn) {
        try {
          const isbnCoverUrl = await coverUrlByIsbn(metaIsbn);
          if (isbnCoverUrl) {
            coverByNumber.set(n, { url: isbnCoverUrl, source: 'openlibrary', isbn: metaIsbn });
            continue;
          }
        } catch (err) {
          log.warn(
            { seriesId, volume: n, isbn: metaIsbn, err: err instanceof Error ? err.message : String(err) },
            'open library isbn cover lookup failed; falling through to title search',
          );
        }
      }

      // OL-by-title tier: search by series title + volume number
      if (seriesTitles.length === 0) continue;
      const queryTitle = series.titleEnglish ?? series.titleRomaji;
      try {
        const hits = await searchBooks(`${queryTitle} vol ${n}`);
        const match = matchVolumeEdition(hits, { seriesTitles, volumeNumber: n });
        if (!match) continue;
        if (match.coverUrl) {
          coverByNumber.set(n, {
            url: match.coverUrl,
            source: 'openlibrary',
            olid: match.olid,
            isbn: match.isbn,
          });
        }
      } catch (err) {
        log.warn(
          { seriesId, volume: n, err: err instanceof Error ? err.message : String(err) },
          'open library lookup failed; continuing',
        );
      }
    }

    // --- Volume upserts (1..effectiveTotal) ---
    const existing = await listVolumesBySeries(seriesId);
    const existingByNumber = new Map(existing.map((v) => [v.number, v]));

    let volumesAdded = 0;
    let volumesUpdated = 0;

    for (let n = 1; n <= effectiveTotal; n++) {
      const coverEntry = coverByNumber.get(n);
      const metaEntry = metaByNumber.get(n);
      const row = existingByNumber.get(n);

      const volTitle = metaEntry?.title ?? `Volume ${n}`;

      // Build metadata object
      const meta: Record<string, unknown> = {};
      if (metaEntry?.googleBooksVolumeId) meta.googleBooksVolumeId = metaEntry.googleBooksVolumeId;
      if (coverEntry) {
        meta.coverUrl = coverEntry.url;
        meta.coverSource = coverEntry.source;
        if (coverEntry.olid) meta.olid = coverEntry.olid;
        if (coverEntry.isbn) meta.isbn = coverEntry.isbn;
      }
      if (metaEntry?.description) meta.description = metaEntry.description;
      if (metaEntry?.pageCount != null) meta.pageCount = metaEntry.pageCount;

      if (!row) {
        await insertVolume({
          seriesId,
          number: n,
          title: volTitle,
          metadataJson: Object.keys(meta).length > 0 ? stableStringify(meta) : '{}',
        });
        volumesAdded++;
        continue;
      }

      const upd: VolumeUpdate = {};
      // Only update the title when we have fresh metadata for this volume.
      if (metaEntry && row.title !== volTitle) upd.title = volTitle;
      // The cover is authoritative every run for every in-range volume: drop any
      // previously-stored cover first so a stale Google "image not available"
      // placeholder is cleared when this run finds no real GB/OL cover, then
      // re-add whatever cover (GB or OL) we resolved. Runs even when there is no
      // fresh metadata, so an OL-only cover still lands on an existing stub row.
      {
        const base = parseMeta(row.metadataJson);
        delete base.coverUrl;
        delete base.coverSource;
        delete base.olid;
        delete base.isbn;
        const nextMeta = { ...base, ...meta };
        const nextJson = stableStringify(nextMeta);
        if (nextJson !== row.metadataJson) upd.metadataJson = nextJson;
      }
      if (Object.keys(upd).length > 0) {
        await updateVolume(row.id, upd);
        volumesUpdated++;
      }
    }

    log.info({ seriesId, totalVolumes: derived.totalVolumes, volumesAdded, volumesUpdated }, 'googlebooks hydrate complete');
    return { seriesId, totalVolumes: derived.totalVolumes, volumesAdded, volumesUpdated };
  },
};
