/**
 * Pure mapping between a normalized reading `position` (0..1) and the
 * format-specific coordinates each player works in: page numbers (comics /
 * pdf), seconds (audio), and EPUB spine offsets. No DOM, no React — safe to
 * unit-test in a node environment.
 *
 * Ported verbatim from the web reader (`apps/web/src/components/reader/lib/
 * position.ts`) to keep web/mobile parity; the web unit test vectors are
 * mirrored under `tests/unit/reader/position.test.ts`.
 */

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Map a 0-based page index to a 0..1 position. A single-page document maps
 * any non-first page to 1 and the first page to 0.
 */
export function pageToPosition(page: number, pageCount: number): number {
  if (pageCount <= 1) return page >= 1 ? 1 : 0;
  return clamp01(page / (pageCount - 1));
}

/** Map a 0..1 position back to a 0-based page index, clamped to the document. */
export function positionToPage(position: number, pageCount: number): number {
  if (pageCount <= 1) return 0;
  const page = Math.round(clamp01(position) * (pageCount - 1));
  return Math.min(Math.max(page, 0), pageCount - 1);
}

/** Map a time offset (seconds) to a 0..1 position; guards divide-by-zero. */
export function audioPosition(sec: number, totalSec: number): number {
  if (totalSec > 0) return clamp01(sec / totalSec);
  return 0;
}

/** Map a 0..1 position back to a time offset in seconds. */
export function audioSec(position: number, totalSec: number): number {
  return clamp01(position) * totalSec;
}

/**
 * Map an EPUB spine location (which item, plus page within that item) to a
 * monotonic 0..1 position. Each spine item occupies an equal `1/spineCount`
 * slice of the bar; the page-within-item refines the position inside its slice.
 */
export function spineToPosition(
  spineIdx: number,
  pageInItem: number,
  pagesInItem: number,
  spineCount: number,
): number {
  if (spineCount <= 0) return 0;
  const withinItem = pagesInItem > 0 ? pageInItem / pagesInItem : 0;
  return clamp01((spineIdx + withinItem) / spineCount);
}
