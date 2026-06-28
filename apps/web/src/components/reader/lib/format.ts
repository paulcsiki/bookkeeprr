/**
 * Pure formatting + position helpers for the reader chrome. Ported and adapted
 * from the prototype's `reader-core.jsx` (`fmtClock`, `fmtTimecode`,
 * `chapterAt`, `pageAt`) to operate over a `ReaderManifest`-shaped value rather
 * than the prototype's ad-hoc `book` object.
 *
 * No DOM, no React — safe to unit-test in a node environment.
 */

import type { ChapterMark, ReaderManifest } from '@bookkeeprr/types';

/** The slice of a manifest the chrome's math actually needs. */
export interface ChromeBook {
  reader: ReaderManifest['reader'];
  pageCount?: number | null;
  totalSec?: number | null;
  chapters?: ChapterMark[];
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** `H h MM m` (or `M m` under an hour). Input is minutes. */
export function fmtClock(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m}m`;
}

/** `H:MM:SS` (or `M:SS` under an hour). Input is minutes. */
export function fmtTimecode(min: number): string {
  const totalSec = Math.round(min * 60);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = m.toString().padStart(2, '0');
  const ss = s.toString().padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/** Whether this manifest is paged by time (audio) rather than by page. */
export function isTimeBased(book: ChromeBook): boolean {
  return book.reader === 'audio';
}

/** Total pages for a paged manifest (>=1). */
export function totalPages(book: ChromeBook): number {
  return Math.max(1, book.pageCount ?? 1);
}

/** Total minutes for an audio manifest. */
export function totalMin(book: ChromeBook): number {
  return (book.totalSec ?? 0) / 60;
}

/**
 * The 0..1 start position of each chapter, in chapter order. Audio chapters
 * use `startSec`; paged chapters use `startPage` (1-based). Falls back to an
 * even split when a chapter has no explicit start.
 */
export function chapterPositions(book: ChromeBook): number[] {
  const chapters = book.chapters ?? [];
  if (chapters.length === 0) return [];
  if (isTimeBased(book)) {
    const total = book.totalSec ?? 0;
    return chapters.map((c, i) =>
      total > 0 && c.startSec != null
        ? clamp01(c.startSec / total)
        : clamp01(i / chapters.length),
    );
  }
  const pages = totalPages(book);
  return chapters.map((c, i) =>
    c.startPage != null ? clamp01((c.startPage - 1) / pages) : clamp01(i / chapters.length),
  );
}

/** The chapter containing `position` (0..1), or undefined when none exist. */
export function chapterAt(book: ChromeBook, position: number): ChapterMark | undefined {
  const chapters = book.chapters ?? [];
  if (chapters.length === 0) return undefined;
  const starts = chapterPositions(book);
  const p = clamp01(position);
  for (let i = chapters.length - 1; i >= 0; i--) {
    if (p >= (starts[i] ?? 0)) return chapters[i];
  }
  return chapters[0];
}

/** The 0-based index of the chapter containing `position`. */
export function chapterIndexAt(book: ChromeBook, position: number): number {
  const chapters = book.chapters ?? [];
  if (chapters.length === 0) return -1;
  const starts = chapterPositions(book);
  const p = clamp01(position);
  for (let i = chapters.length - 1; i >= 0; i--) {
    if (p >= (starts[i] ?? 0)) return i;
  }
  return 0;
}

/** 1-based current page for a paged manifest at `position`. */
export function pageAt(book: ChromeBook, position: number): number {
  const pages = totalPages(book);
  return Math.max(1, Math.min(pages, Math.round(clamp01(position) * pages) || 1));
}

/**
 * Pure scrub math: a pointer's `clientX` mapped to a 0..1 position within a
 * rail rect. Extracted so the drag handlers stay trivial and testable.
 */
export function posFromClientX(
  clientX: number,
  rect: { left: number; width: number },
): number {
  if (rect.width <= 0) return 0;
  return clamp01((clientX - rect.left) / rect.width);
}
