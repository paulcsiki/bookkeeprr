'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ComponentProps } from 'react';

/**
 * Theme keys are kept as their underlying hue names (violet, amber, …) so
 * the connection to the design artifact stays explicit. Each key has a
 * display label drawn from Japanese vocabulary (chat 5, 2026-05-29 design
 * refresh) — these are what the user actually picks in the UI.
 *
 * - Tsundoku (violet) — 積ん読; piling up books without reading them.
 * - Kohaku (amber) — 琥珀; the amber stone.
 * - Sakura (rose) — 桜; cherry blossom.
 * - Asagi (teal) — 浅葱; pale leek green.
 * - Sora (sky) — 空; sky.
 * - Moegi (lime) — 萌葱; fresh spring green.
 * - Shiro (mono) — 白; white.
 * - Sumi (ink) — 墨; black ink. Reserved for light themes.
 */
export const ACCENT_THEMES = ['violet', 'amber', 'rose', 'teal', 'sky', 'lime', 'mono', 'ink'] as const;

export type AccentTheme = (typeof ACCENT_THEMES)[number];

export const THEME_LABELS: Record<AccentTheme, string> = {
  violet: 'Tsundoku',
  amber: 'Kohaku',
  rose: 'Sakura',
  teal: 'Asagi',
  sky: 'Sora',
  lime: 'Moegi',
  mono: 'Shiro',
  ink: 'Sumi',
};

export const THEME_HUES: Record<AccentTheme, string> = {
  violet: 'hsl(263 70% 60%)',
  amber: 'hsl(38 82% 58%)',
  rose: 'hsl(348 80% 62%)',
  teal: 'hsl(174 70% 50%)',
  sky: 'hsl(208 90% 62%)',
  lime: 'hsl(96 62% 56%)',
  mono: 'hsl(0 0% 90%)',
  ink: 'hsl(0 0% 12%)',
};

/**
 * Wrap the app with next-themes configured to swap the body class between
 * `theme-violet`, `theme-amber`, etc. The 8 themes only retint the
 * primary/accent — neutrals and content-type colors stay constant.
 *
 * The choice is persisted in localStorage under `bookkeeprr-theme` and
 * defaults to `violet` (Tsundoku — matches @bookkeeprr/tokens baseline).
 */
export function ThemeProvider(props: { children: React.ReactNode }): React.JSX.Element {
  const nextThemesProps: ComponentProps<typeof NextThemesProvider> = {
    attribute: 'class',
    defaultTheme: 'violet',
    themes: [...ACCENT_THEMES],
    enableSystem: false,
    enableColorScheme: false,
    storageKey: 'bookkeeprr-theme',
    value: Object.fromEntries(ACCENT_THEMES.map((t) => [t, `theme-${t}`])),
  };
  return <NextThemesProvider {...nextThemesProps}>{props.children}</NextThemesProvider>;
}
