// Reader page-theme keys + pure resolution helpers.
// These themes are an ADDITIVE token set (`--reader-*`) scoped by
// `data-reader-theme`; they are NOT a light-mode toggle for the app shell.
// The literal palette lives in `packages/tokens/reader-themes.css`.

export const READER_THEME_KEYS = ['paper', 'sepia', 'dark', 'oled'] as const;

export type ReaderThemeKey = (typeof READER_THEME_KEYS)[number];

/**
 * Resolve the "Auto" theme to a concrete key from the OS color scheme.
 * Pure — takes a boolean so it needs no DOM (callers pass the result of a
 * `matchMedia('(prefers-color-scheme: dark)')` query).
 */
export function resolveAutoTheme(prefersDark: boolean): ReaderThemeKey {
  return prefersDark ? 'dark' : 'paper';
}

/** Whether a reader theme paints on a dark page (used to flip chrome math). */
export function isDarkReaderTheme(key: ReaderThemeKey): boolean {
  return key === 'dark' || key === 'oled';
}
