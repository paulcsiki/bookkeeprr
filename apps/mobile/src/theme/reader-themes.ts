/**
 * Reader-page themes for the native reader.
 *
 * The web app paints the reading surface from CSS custom properties scoped by
 * `data-reader-theme` (see `packages/tokens/reader-themes.css`). React Native
 * has no CSS variables, so this module mirrors those exact values as a typed JS
 * palette the native readers consume directly.
 *
 * The values are copied verbatim from `reader-themes.css` with one necessary
 * adaptation: the sepia accent is authored there as `oklch(0.55 0.13 40)`.
 * React Native's StyleSheet color parser does not reliably render `oklch()`
 * literals (the same reason `tokens.ts` ships rgb() fallbacks for the status
 * surfaces), so the sepia accent is converted to its sRGB equivalent
 * `rgb(175, 83, 49)`. All other sepia values are hsl()/hex, which RN renders
 * fine. The paper/dark/oled accents follow the app's themable primary, so they
 * take the active `primary` token passed by the caller.
 */

/** The four reader-page themes, in display order. */
export const READER_THEME_KEYS = ['paper', 'sepia', 'dark', 'oled'] as const;
export type ReaderThemeKey = (typeof READER_THEME_KEYS)[number];

/** A resolved reader-page palette. Field names mirror the CSS token suffixes. */
export interface ReaderPalette {
  /** Page surface (`--reader-page`). */
  page: string;
  /** Primary ink (`--reader-ink`). */
  ink: string;
  /** Softened ink for secondary text (`--reader-ink-soft`). */
  inkSoft: string;
  /** Faint ink for tertiary detail (`--reader-faint`). */
  faint: string;
  /** Chrome surface that frames the page (`--reader-chrome`). */
  chrome: string;
  /** Secondary chrome surface (`--reader-chrome-2`). */
  chrome2: string;
  /** Hairline divider (`--reader-line`). */
  line: string;
  /** Heavier divider (`--reader-line-2`). */
  line2: string;
  /** Text-selection highlight (`--reader-sel`). */
  sel: string;
  /** Theme accent (`--reader-accent`). */
  accent: string;
}

/**
 * The sepia accent, converted from `oklch(0.55 0.13 40)` (the prototype's warm
 * tone) to its sRGB equivalent so RN renders it reliably.
 */
const SEPIA_ACCENT = 'rgb(175, 83, 49)';

/** Per-theme palettes minus the accent (which depends on the app primary). */
const BASE: Record<ReaderThemeKey, Omit<ReaderPalette, 'accent'>> = {
  paper: {
    page: '#faf7f0',
    ink: 'hsl(38 16% 16%)',
    inkSoft: 'hsl(38 10% 38%)',
    faint: 'hsl(38 8% 62%)',
    chrome: '#f1ede3',
    chrome2: '#efe9dd',
    line: 'hsl(38 14% 84%)',
    line2: 'hsl(38 12% 78%)',
    sel: 'hsl(45 90% 62% / 0.34)',
  },
  sepia: {
    page: '#f3e7cf',
    ink: 'hsl(28 28% 20%)',
    inkSoft: 'hsl(28 18% 40%)',
    faint: 'hsl(28 16% 60%)',
    chrome: '#ecdcbf',
    chrome2: '#e7d5b4',
    line: 'hsl(33 32% 76%)',
    line2: 'hsl(33 28% 70%)',
    sel: 'hsl(35 80% 55% / 0.34)',
  },
  dark: {
    page: 'hsl(240 8% 12%)',
    ink: 'hsl(40 12% 86%)',
    inkSoft: 'hsl(40 6% 60%)',
    faint: 'hsl(40 5% 42%)',
    chrome: 'hsl(240 9% 9%)',
    chrome2: 'hsl(240 9% 14%)',
    line: 'hsl(240 6% 20%)',
    line2: 'hsl(240 6% 26%)',
    sel: 'hsl(263 70% 60% / 0.32)',
  },
  oled: {
    page: '#000000',
    ink: 'hsl(0 0% 80%)',
    inkSoft: 'hsl(0 0% 52%)',
    faint: 'hsl(0 0% 34%)',
    chrome: '#060608',
    chrome2: 'hsl(240 8% 8%)',
    line: 'hsl(240 6% 15%)',
    line2: 'hsl(240 6% 22%)',
    sel: 'hsl(263 70% 60% / 0.34)',
  },
};

/**
 * Resolve a reader-page palette for `key`. `primary` is the active app accent
 * (from `useTokens().primary`); paper/dark/oled use it as their accent while
 * sepia keeps its constant warm tone.
 */
export function readerPalette(key: ReaderThemeKey, primary: string): ReaderPalette {
  return {
    ...BASE[key],
    accent: key === 'sepia' ? SEPIA_ACCENT : primary,
  };
}

/**
 * The theme an "auto" preference resolves to: dark when the OS is in dark mode,
 * the light paper page otherwise.
 */
export function resolveAutoTheme(prefersDark: boolean): ReaderThemeKey {
  return prefersDark ? 'dark' : 'paper';
}
