/**
 * Pure mapping between a normalized reading `position` (0..1) and the
 * format-specific coordinates each player works in: page numbers (comics /
 * pdf), seconds (audio), and EPUB spine offsets. No DOM, no React — safe to
 * unit-test in a node environment.
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

/**
 * Count the column-pages a CSS multi-column EPUB spine item occupies.
 *
 * The iframe body is laid out as fixed-height columns of `colWidth`, separated
 * by `gap`, inside a content box that is inset by `padX` of horizontal padding.
 * The browser reports `scrollWidth` for the whole padded box, so the columns'
 * own extent is `scrollWidth - padX`, and `n` columns of width `colWidth` with
 * `n - 1` gaps satisfy `n*colWidth + (n-1)*gap = extent`, i.e.
 * `n = (extent + gap) / (colWidth + gap)`.
 *
 * This is the SINGLE SOURCE OF TRUTH for an item's page count: both the
 * keyboard/tap stepper and the slider's within-item refinement rely on it, so
 * the stepper must never be able to land past the last real column (a blank
 * trailing page). Rounding (not ceil-with-fudge) keeps the count exact and
 * tolerant of sub-pixel `scrollWidth` reports.
 */
export function epubColumnPageCount(
  scrollWidth: number,
  colWidth: number,
  gap: number,
  padX: number,
): number {
  if (!(colWidth > 0)) return 1;
  const step = colWidth + gap;
  if (!(step > 0)) return 1;
  const extent = Math.max(0, scrollWidth - padX);
  const count = Math.round((extent + gap) / step);
  return Math.max(1, count);
}
