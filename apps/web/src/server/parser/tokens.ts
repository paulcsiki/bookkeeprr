const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'of',
  'no',
  'in',
  'on',
  'at',
  'to',
  'and',
  'or',
  '&',
]);

export function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function tokenize(s: string): string[] {
  const normalized = normalize(s);
  return normalized
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t));
}

export function tokenSet(s: string): Set<string> {
  return new Set(tokenize(s));
}

export function hasAllTokens(needles: string[], haystack: Set<string>): boolean {
  if (needles.length === 0) return false;
  for (const n of needles) if (!haystack.has(n)) return false;
  return true;
}

export const KNOWN_QUALIFIERS: ReadonlySet<string> = new Set([
  'deluxe',
  'edition',
  'omnibus',
  'kanzenban',
  'complete',
  'hardcover',
  'oneshot',
  'color',
  'colored',
  'premium',
  'collectors',
  'collector',
  'special',
  'extended',
  // Book/audiobook release qualifiers (format/quality words, not identity)
  'retail',
  'ebook',
  'unabridged',
  'abridged',
]);

/**
 * File-format tokens that appear in release titles (often as the trailing
 * extension: "Series v01.cbz" → tokens ["series", "v01", "cbz"]). These
 * describe format, not identity, so the matcher must ignore them when
 * comparing release-title tokens to series-title tokens.
 */
export const FILE_FORMAT_TOKENS: ReadonlySet<string> = new Set([
  // Comic / manga archives
  'cbz', 'cbr', 'cb7', 'cbt',
  // Ebook
  'epub', 'mobi', 'pdf', 'azw', 'azw3', 'kfx',
  // Audiobook
  'mp3', 'm4a', 'm4b', 'flac', 'ogg', 'opus', 'aac', 'wav',
  // Generic archive (sometimes appears alongside a content extension)
  'zip', 'rar', '7z', 'tar',
]);

/** Matches pure numerics, year-like values, and volume/chapter markers such as v01, vol3, c12, ch007. */
const NUMERIC_TOKEN_RE = /^\d+$|^(?:v|vol|c|ch)\d+/;

export function tokensExcludingQualifiers(tokens: string[]): string[] {
  return tokens.filter(
    (t) =>
      !KNOWN_QUALIFIERS.has(t) && !FILE_FORMAT_TOKENS.has(t) && !NUMERIC_TOKEN_RE.test(t),
  );
}
