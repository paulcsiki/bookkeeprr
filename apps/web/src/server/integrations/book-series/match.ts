/**
 * Matching helpers for book-series auto-detection.
 *
 * Deliberately thin: reuse normalize and parseVolumeNumber from the Google Books
 * derive module so the normalisation logic stays in one place.
 */
import { normalize, parseVolumeNumber } from '@/server/integrations/googlebooks/derive';

/**
 * Normalise a series name for comparison purposes.
 * Delegates to the same `normalize` used in Google Books volume matching.
 */
export function normalizeSeriesName(s: string): string {
  return normalize(s);
}

export type StrippedTitle = {
  /** Title with volume suffix removed (original when no suffix found). */
  base: string;
  /** Extracted volume number, or null when no numeric volume marker was found. */
  position: number | null;
};

/**
 * Attempt to strip a trailing "Vol. N" / "Volume N" suffix from a title.
 *
 * Returns `{ base, position }` where `base` is the part before the suffix
 * (trimmed of trailing punctuation/whitespace) and `position` is the parsed
 * volume number.  When no volume marker is found both fields pass through the
 * original title unchanged with `position: null`.
 */
export function stripVolumeSuffix(title: string): StrippedTitle {
  const position = parseVolumeNumber(title);
  if (position === null) {
    return { base: title, position: null };
  }

  // Remove the volume marker (and everything after) to produce the base title.
  // Handles "Vol.", "Volume", "vol", etc.
  const stripped = title.replace(/[,\s]*\bvol(?:ume)?\.?\s*\d+(\.\d+)?\b.*/i, '').trim();
  return { base: stripped || title, position };
}

/**
 * True when two series names normalise to the same string.
 * Case-insensitive; punctuation and extra whitespace are collapsed.
 */
export function nameMatch(a: string, b: string): boolean {
  return normalize(a) === normalize(b);
}
