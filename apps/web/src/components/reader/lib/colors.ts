/**
 * Token-only color helpers for the reader chrome.
 *
 * The prototype used `inkA(th, a)` to derive translucent hairlines/fills from
 * the active theme's ink, branching on `th.dark` to pick white-vs-dark ink.
 * Here the ink is already a single theme token (`--reader-ink`) that the page
 * surface flips for us, so we translate the same intent into a token-based
 * `color-mix(...)` — no literal hsl/hex ever appears.
 */

import type { ReaderManifest } from '@bookkeeprr/types';

/**
 * Returns true when the active reader theme is a dark palette (dark / oled).
 * Reads `data-reader-theme` from the closest ancestor element that has it set.
 * SSR-safe: returns false when `document` is not available.
 */
export function isDarkTheme(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.querySelector('[data-reader-theme]');
  const key = el?.getAttribute('data-reader-theme') ?? '';
  return key === 'dark' || key === 'oled';
}

/**
 * Translucent ink as a `color-mix` over the `--reader-ink` token.
 * `inkA(0.16)` → 16% ink, 84% transparent.
 */
export function inkA(alpha: number): string {
  const pct = Math.round(Math.max(0, Math.min(1, alpha)) * 100);
  return `color-mix(in srgb, var(--reader-ink) ${pct}%, transparent)`;
}

/** Translucent over the accent token (e.g. swatch focus glow). */
export function accentA(alpha: number): string {
  const pct = Math.round(Math.max(0, Math.min(1, alpha)) * 100);
  return `color-mix(in srgb, var(--reader-accent) ${pct}%, transparent)`;
}

/** Fixed content-type accent token for a manifest's content type. */
const CONTENT_TYPE_TOKEN: Record<string, string> = {
  manga: 'var(--color-manga)',
  comic: 'var(--color-comic)',
  novel: 'var(--color-novel)',
  ebook: 'var(--color-ebook)',
  audio: 'var(--color-audio)',
};

export function contentTypeColor(contentType: ReaderManifest['contentType']): string {
  return CONTENT_TYPE_TOKEN[contentType] ?? 'var(--reader-accent)';
}
