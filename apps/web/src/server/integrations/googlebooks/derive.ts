/** A normalized Google Books edition (one printed volume). */
export type Edition = {
  id: string;
  title: string;
  publisher: string | null;
  description: string | null;
  pageCount: number | null;
  language: string | null;
  coverUrl: string | null;
  viewability: string | null;
  isbn: string | null;
  /** Raw Google Books publish date, e.g. "2011-06-17" or "2008". Optional. */
  publishedDate?: string | null;
};

/** Extract a plausible 4-digit publication year from an edition's publishedDate. */
export function editionYear(ed: Edition): number | null {
  const d = ed.publishedDate;
  if (!d) return null;
  const m = /(\d{4})/.exec(d);
  if (!m) return null;
  const y = parseInt(m[1]!, 10);
  return y >= 1900 && y <= 2100 ? y : null;
}

/** A Google Books edition has a real (non-placeholder) cover only when it is a
 * Google-hosted edition: id ends in "QBAJ", or it is at least partially viewable.
 * Catalog-only records (…ACAAJ, NO_PAGES) advertise a thumbnail that resolves to
 * Google's "image not available" placeholder, so their cover must be ignored. */
export function hasRealCover(ed: Edition): boolean {
  if (!ed.coverUrl) return false;
  return /QBAJ$/i.test(ed.id) || (ed.viewability != null && ed.viewability !== 'NO_PAGES');
}

export type DerivedVolume = {
  number: number;
  title: string;
  coverUrl: string | null;
  description: string | null;
  pageCount: number | null;
  googleBooksVolumeId: string;
  isbn: string | null;
};

export type DerivedSeries = {
  totalVolumes: number;
  publisher: string | null;
  seriesCoverUrl: string | null;
  seriesDescription: string | null;
  volumes: DerivedVolume[];
};

export function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// After the series-title prefix, allow only optional noise words (edition/format
// tags) before the volume marker — rejects spin-offs/sub-series like
// "Solo Leveling: Side Stories, Vol. 1" while accepting "Solo Leveling (Novel), Vol. 6"
// or "Bleach (Manga), Vol. 25".
const NOISE = '(?:novel|light\\s+novel|manga|comic|manhwa|the|complete|omnibus)\\s+';
export function titleMatchesSeries(normTitle: string, normSeries: string): boolean {
  const escaped = normSeries.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('^' + escaped + '\\s+(?:' + NOISE + ')*vol(?:ume)?\\s+\\d');
  return re.test(normTitle);
}

/** From targeted-query editions, pick the best real-cover edition for a
 * specific volume number (title prefix-matches series, has a real cover).
 * By default, comic/manga/manhwa editions are rejected (novel behavior).
 * Pass `{ allowComicCategories: true }` to accept them (manga hydrate). */
export function pickVolumeEdition(
  editions: Edition[],
  seriesTitle: string,
  volume: number,
  opts: { allowComicCategories?: boolean } = {},
): Edition | null {
  const normSeries = normalize(seriesTitle);
  const candidates = editions.filter((e) => {
    // Language: accept en or absent (langRestrict=en was used upstream)
    if (e.language && e.language !== 'en') return false;
    // Volume number must match exactly
    if (parseVolumeNumber(e.title) !== volume) return false;
    // Title must prefix-match the series
    if (!titleMatchesSeries(normalize(e.title), normSeries)) return false;
    // Reject comic/manga/manhwa editions unless explicitly allowed (manga hydrate).
    if (!opts.allowComicCategories && /\b(comic|manga|manhwa)\b/.test(normalize(e.title)))
      return false;
    // Must have a real cover
    if (!hasRealCover(e)) return false;
    return true;
  });

  if (candidates.length === 0) return null;
  // Prefer an edition with a description
  return candidates.find((e) => e.description) ?? candidates[0]!;
}

/**
 * Extract a discrete volume number from an edition title, e.g.
 * "Solo Leveling, Vol. 6 (novel)" -> 6. Returns null for ranges
 * ("Vols. 1-5"), fractional volumes ("Vol. 8.5"), box sets, and titles
 * with no volume marker.
 */
export function parseVolumeNumber(title: string): number | null {
  // Reject explicit ranges (box sets) — they must not contribute a count.
  if (/vol(?:s|umes)?\.?\s*\d+\s*[-–]\s*\d+/i.test(title)) return null;
  // Reject fractional volumes (e.g. "Vol. 8.5" half-volume extras).
  if (/\bvol(?:ume)?\.?\s*\d+\.\d/i.test(title)) return null;
  const m = title.match(/\bvol(?:ume)?\.?\s*(\d+)\b/i);
  if (!m) return null;
  return parseInt(m[1]!, 10);
}

/**
 * Turn raw editions into a confident series view, or null when the result is
 * too weak to trust (fewer than 2 numbered English volumes whose title is
 * prefixed by the series title).
 */
export function deriveSeriesFromEditions(
  editions: Edition[],
  seriesTitle: string,
): DerivedSeries | null {
  const wantPrefix = normalize(seriesTitle);

  // Filter: English, title prefix-matches the series, has a discrete vol number.
  type Candidate = { number: number; ed: Edition };
  const candidates: Candidate[] = [];
  for (const e of editions) {
    // Editions with an absent language are kept (assumed English) because
    // searchSeriesVolumes always passes langRestrict=en upstream; only an
    // explicitly non-English language is rejected.
    if (e.language && e.language !== 'en') continue;
    const num = parseVolumeNumber(e.title);
    if (num === null) continue;
    // Title must match the series prefix followed by optional noise words and a
    // volume marker — rejects spin-offs/sub-series (e.g. "Side Stories").
    const norm = normalize(e.title);
    if (!titleMatchesSeries(norm, wantPrefix)) continue;
    // Reject comic/manga/manhwa editions (light-novel series only).
    if (/\b(comic|manga|manhwa)\b/.test(norm)) continue;
    candidates.push({ number: num, ed: e });
  }

  // Dedupe by volume number:
  // - METADATA (title/description/pageCount/id): prefer the edition with best score.
  // - COVER: the first candidate for that number where hasRealCover() is true, else null.
  const byNumber = new Map<number, Edition>();
  // First real (non-placeholder) cover seen per volume number, scanning ALL
  // candidates — a later QBAJ edition must win even if a catalog edition for the
  // same volume was seen first. Absence => no real cover (resolves to null below).
  const realCoverByNumber = new Map<number, string>();
  const score = (e: Edition): number => (e.coverUrl ? 1 : 0) + (e.description ? 1 : 0);
  for (const c of candidates) {
    const cur = byNumber.get(c.number);
    if (!cur || score(c.ed) > score(cur)) byNumber.set(c.number, c.ed);
    if (!realCoverByNumber.has(c.number) && hasRealCover(c.ed) && c.ed.coverUrl) {
      realCoverByNumber.set(c.number, c.ed.coverUrl);
    }
  }

  if (byNumber.size < 2) return null;

  const numbers = [...byNumber.keys()].sort((a, b) => a - b);
  const totalVolumes = numbers[numbers.length - 1]!;

  const volumes: DerivedVolume[] = numbers.map((n) => {
    const e = byNumber.get(n)!;
    return {
      number: n,
      title: e.title,
      coverUrl: realCoverByNumber.get(n) ?? null,
      description: e.description,
      pageCount: e.pageCount,
      googleBooksVolumeId: e.id,
      isbn: e.isbn,
    };
  });

  // Publisher: modal value across the kept editions.
  const pubCounts = new Map<string, number>();
  for (const n of numbers) {
    const p = byNumber.get(n)!.publisher;
    if (p) pubCounts.set(p, (pubCounts.get(p) ?? 0) + 1);
  }
  let publisher: string | null = null;
  let best = 0;
  for (const [p, c] of pubCounts) {
    if (c > best) {
      best = c;
      publisher = p;
    }
  }

  const v1 = byNumber.get(numbers[0]!)!;

  // seriesCoverUrl: real cover of the lowest-numbered volume that has one.
  const seriesCoverUrl = volumes.find((v) => v.coverUrl != null)?.coverUrl ?? null;

  return {
    totalVolumes,
    publisher,
    seriesCoverUrl,
    seriesDescription: v1.description,
    volumes,
  };
}
