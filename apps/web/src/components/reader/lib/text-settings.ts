/**
 * Pure text-reader settings helpers: the font-family stack for each font key,
 * a settings clamp, and the spine-href → zip-entry-path join. No DOM, no React
 * — safe to unit-test in a node environment.
 */

import type { ReaderFontKey } from '../SettingsSheet';

/**
 * The CSS `font-family` value for each font choice. `sans` and `mono` defer to
 * the app's own font variables (Geist / Geist Mono) so the reader stays inside
 * the three-font design system; `serif` and `dys` add a reading-oriented stack
 * the design system doesn't otherwise provide a token for.
 */
const FONT_STACK: Record<ReaderFontKey, string> = {
  serif: 'Georgia, "Iowan Old Style", "Palatino Linotype", serif',
  sans: 'var(--font-geist-sans), system-ui, sans-serif',
  mono: 'var(--font-geist-mono), ui-monospace, monospace',
  dys: '"OpenDyslexic", "Comic Sans MS", "Trebuchet MS", Verdana, system-ui, sans-serif',
};

/** Resolve a font key to its CSS `font-family` stack. */
export function fontStack(font: ReaderFontKey): string {
  return FONT_STACK[font];
}

/** The clampable subset of text settings. */
export interface TextSettings {
  fontSize: number;
  lineH: number;
}

export const FONT_SIZE_MIN = 13;
export const FONT_SIZE_MAX = 28;
export const LINE_H_MIN = 1.3;
export const LINE_H_MAX = 2.2;

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

/** Clamp font size to [13,28] and line height to [1.3,2.2]. */
export function clampTextSettings(s: TextSettings): TextSettings {
  return {
    fontSize: clamp(s.fontSize, FONT_SIZE_MIN, FONT_SIZE_MAX),
    lineH: clamp(s.lineH, LINE_H_MIN, LINE_H_MAX),
  };
}

/**
 * Join an OPF directory with an OPF-relative spine/TOC href into the zip entry
 * name the EPUB resource route serves, normalizing `./` and `../` segments.
 * Mirrors the backend's `joinEntry` so the path the iframe requests matches the
 * literal entry name the route checks.
 */
export function entryPathFor(opfDir: string | undefined, href: string): string {
  const raw = opfDir ? `${opfDir}/${href}` : href;
  const parts: string[] = [];
  for (const seg of raw.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}
