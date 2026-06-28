import type { OpenLibrarySearchHit } from './client';

/**
 * Normalize a title for comparison: lowercase, strip punctuation, collapse
 * whitespace. Keeps alphanumerics (incl. non-Latin letters) and spaces.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// CJK ideographs, plus Hiragana/Katakana, Halfwidth/Fullwidth forms.
const CJK_RE = /[぀-ヿ㐀-䶿一-鿿豈-﫿＀-￯]/;

const VOLUME_RE = /(?:vol\.?|volume)\s*0*(\d+)\b/i;
// Omnibus / range / N-in-1 collections carry collection art, not single-volume
// art — reject them so e.g. "Vol. 1-3 Omnibus" never fills volume 1's cover.
const RANGE_RE = /(?:vol\.?|volume)\s*0*\d+\s*[-–]\s*\d+|\b\d+\s*-?\s*in\s*-?\s*1\b|omnibus/i;

export type VolumeEditionMatch = {
  coverUrl: string | null;
  year: number | null;
  isbn: string | null;
  olid: string;
};

/**
 * Conservatively pick the Open Library hit that corresponds to a specific
 * volume of a manga series. Returns null rather than risk the wrong volume.
 */
export function matchVolumeEdition(
  hits: OpenLibrarySearchHit[],
  opts: { seriesTitles: string[]; volumeNumber: number },
): VolumeEditionMatch | null {
  // Require ≥3 chars per series title so a generic short name (e.g. "Air")
  // can't loosely match unrelated books.
  const series = opts.seriesTitles
    .map(normalize)
    .filter((t) => t.length >= 3);
  if (series.length === 0) return null;

  const valid = hits.filter((hit) => {
    const rawTitle = hit.title;
    // Reject Japanese editions.
    if (CJK_RE.test(rawTitle)) return false;
    if (rawTitle.toLowerCase().includes('[in japanese]')) return false;

    // Reject omnibus / multi-volume collections (wrong cover for a single vol).
    if (RANGE_RE.test(rawTitle)) return false;

    // Must reference the requested volume number as a volume marker.
    const m = rawTitle.match(VOLUME_RE);
    if (!m || Number(m[1]) !== opts.volumeNumber) return false;

    // Must contain at least one series title.
    const normTitle = normalize(rawTitle);
    return series.some((s) => normTitle.includes(s));
  });

  if (valid.length === 0) return null;

  const chosen = valid.find((h) => h.coverUrl !== null) ?? valid[0]!;
  return {
    coverUrl: chosen.coverUrl,
    year: chosen.firstPublishYear,
    isbn: chosen.isbn,
    olid: chosen.olid,
  };
}
