import { colors as pkgColors, themes as pkgThemes } from '@bookkeeprr/tokens';
import { toRgbString } from './color';

export const ACCENT_THEMES = [
  'tsundoku',
  'foxed',
  'sakura',
  'endpaper',
  'cyanotype',
  'bookworm',
  'galley',
  'sumi',
] as const;
export type AccentTheme = (typeof ACCENT_THEMES)[number];

export const COLOR_SCHEMES = ['light', 'dark'] as const;
export type ColorScheme = (typeof COLOR_SCHEMES)[number];

export interface Tokens {
  primary: string;
  primaryFg: string;
  bg: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  text: string;
  textMuted: string;
  manga: string;
  comic: string;
  novel: string;
  ebook: string;
  audio: string;
  ok: string;
  // Foreground for text/icons sitting ON the solid `ok` (green) background.
  // Constant across themes — paired to `ok`, NOT to the accent. Using
  // `primaryFg` here is theme-fragile: accents with a dark primaryFg (amber,
  // lime, mono, sumi) rendered dark-on-green. Matches web's `bg-ok text-white`.
  okFg: string;
  warn: string;
  err: string;
  info: string;
  // Inline-alert surface tokens. The base err/warn/info tokens above are
  // oklch() which RN doesn't render reliably for boxed alpha-blended
  // surfaces on iOS, so alert components consume these RGB fallbacks.
  errFg: string;
  errBg: string;
  errLine: string;
  warnFg: string;
  warnBg: string;
  warnLine: string;
  infoFg: string;
  infoBg: string;
  infoLine: string;
  // Fixed surfaces that stay dark in every theme/scheme: cover backdrops are
  // always dark art, and "on-dark" controls sit over covers/images.
  coverBase: string;
  coverTitle: string;
  coverTitleShadow: string;
  onDarkSurface: string;
  onDarkBorder: string;
  // Scrim overlay used by BottomSheet and modal backdrops.
  scrim: string;
  // Background for a disabled accent swatch in the Appearance ThemeSwitcher.
  swatchDisabledBg: string;
  // Track background for the download progress bar overlaid on a cover image.
  // Matches the design's 'hsl(240 5% 22% / 0.6)' dark semi-transparent track.
  coverProgressTrack: string;
}

// Constants — same across every theme, sourced from @bookkeeprr/tokens.
// Resolved to rgb() because these tokens are oklch() in the package and RN on
// iOS won't render oklch color strings passed directly to a color prop (it
// renders them as the default/black). withAlpha() also consumes the resolved
// rgb for translucent tints.
const CONTENT_TYPES = {
  manga: toRgbString(pkgColors.manga),
  novel: toRgbString(pkgColors.novel),
  comic: toRgbString(pkgColors.comic),
  ebook: toRgbString(pkgColors.ebook),
  audio: toRgbString(pkgColors.audio),
} as const;

const STATUS = {
  ok: toRgbString(pkgColors.ok),
  // White text on the green `ok` badge, matching web's `bg-ok text-white`.
  okFg: 'hsl(0 0% 100%)',
  warn: toRgbString(pkgColors.warn),
  err: toRgbString(pkgColors.err),
  info: toRgbString(pkgColors.info),
  // RGB fallbacks (matching the design system bundle's
  // "tones backed by direct values to dodge oklch(from ...) at small sizes"
  // pattern). Used by InlineAlert and any other boxed/banner status surface.
  errFg: 'rgb(248, 113, 113)',
  errBg: 'rgba(220, 38, 38, 0.10)',
  errLine: 'rgba(220, 38, 38, 0.40)',
  warnFg: 'rgb(251, 191, 36)',
  warnBg: 'rgba(217, 119, 6, 0.10)',
  warnLine: 'rgba(217, 119, 6, 0.45)',
  infoFg: 'rgb(96, 165, 250)',
  infoBg: 'rgba(56, 132, 224, 0.10)',
  infoLine: 'rgba(56, 132, 224, 0.40)',
} as const;

// Constant dark surfaces (covers + on-dark controls), theme/scheme-independent.
const FIXED_DARK = {
  coverBase: 'hsl(240 10% 6%)',
  coverTitle: 'hsl(0 0% 92%)',
  coverTitleShadow: 'rgba(7, 7, 13, 0.7)',
  onDarkSurface: 'rgba(255, 255, 255, 0.06)',
  onDarkBorder: 'rgba(255, 255, 255, 0.08)',
} as const;

// Tokens that are constant across every theme and scheme.
const CONSTANT = {
  scrim: 'rgba(0,0,0,0.65)',
  swatchDisabledBg: 'rgba(128,128,128,0.18)',
  coverProgressTrack: 'rgba(28,28,36,0.6)',
} as const;

// Mobile supports light + dark schemes. @bookkeeprr/tokens only ships dark-mode
// neutrals, so light values remain inline here.
const DARK_NEUTRALS = {
  bg: pkgColors.background,
  surface: pkgColors.card,
  surfaceMuted: pkgColors.muted,
  border: pkgColors.border,
  text: pkgColors.foreground,
  textMuted: pkgColors.mutedForeground,
} as const;

const LIGHT_NEUTRALS = {
  bg: 'hsl(0 0% 100%)',
  surface: 'hsl(240 10% 98%)',
  surfaceMuted: 'hsl(240 6% 94%)',
  border: 'hsl(240 5% 88%)',
  text: 'hsl(240 10% 6%)',
  textMuted: 'hsl(240 5% 40%)',
} as const;

// Map mobile accent-theme names → @bookkeeprr/tokens theme objects.
// Names differ (mobile uses book-themed names; package uses colour names):
//   tsundoku  ↔  violet   hsl(263 70% 60%)
//   foxed     ↔  amber    hsl(38 82% 58%)  NOTE: was hsl(28 85% 58%) locally
//   sakura    ↔  rose     hsl(348 80% 62%)
//   endpaper  ↔  teal     hsl(174 70% 50%)
//   cyanotype ↔  sky      hsl(208 90% 62%)
//   bookworm  ↔  lime     hsl(96 62% 56%)
//   galley    ↔  mono     hsl(0 0% 90%)
const ACCENT_VALUES: Record<
  AccentTheme,
  { primary: string; primaryFgDark: string; primaryFgLight: string }
> = {
  tsundoku: {
    primary: pkgThemes.violet.primary,
    primaryFgDark: 'hsl(0 0% 100%)',
    primaryFgLight: 'hsl(0 0% 100%)',
  },
  foxed: {
    primary: pkgThemes.amber.primary,
    primaryFgDark: pkgThemes.amber.primaryForeground,
    primaryFgLight: pkgThemes.amber.primaryForeground,
  },
  sakura: {
    primary: pkgThemes.rose.primary,
    primaryFgDark: 'hsl(0 0% 100%)',
    primaryFgLight: 'hsl(0 0% 100%)',
  },
  endpaper: {
    primary: pkgThemes.teal.primary,
    primaryFgDark: 'hsl(0 0% 100%)',
    primaryFgLight: 'hsl(0 0% 100%)',
  },
  cyanotype: {
    primary: pkgThemes.sky.primary,
    primaryFgDark: 'hsl(0 0% 100%)',
    primaryFgLight: 'hsl(0 0% 100%)',
  },
  bookworm: {
    primary: pkgThemes.lime.primary,
    primaryFgDark: pkgThemes.lime.primaryForeground,
    primaryFgLight: pkgThemes.lime.primaryForeground,
  },
  galley: {
    primary: pkgThemes.mono.primary,
    primaryFgDark: pkgThemes.mono.primaryForeground,
    primaryFgLight: pkgThemes.mono.primaryForeground,
  },
  // Sumi (ink, near-black) is a light-mode-only accent. The dark entry uses a
  // near-white primary so types stay valid; the Appearance ThemeSwitcher
  // disables it when scheme === 'dark'.
  sumi: {
    primary: '#1f1f25',
    primaryFgDark: pkgThemes.mono.primary, // near-white fallback for dark
    primaryFgLight: '#ffffff',
  },
};

function buildTokens(theme: AccentTheme, scheme: ColorScheme): Tokens {
  const accent = ACCENT_VALUES[theme];
  const neutrals = scheme === 'dark' ? DARK_NEUTRALS : LIGHT_NEUTRALS;
  return {
    primary: accent.primary,
    primaryFg: scheme === 'dark' ? accent.primaryFgDark : accent.primaryFgLight,
    ...neutrals,
    ...CONTENT_TYPES,
    ...STATUS,
    ...FIXED_DARK,
    ...CONSTANT,
  };
}

export const tokens: Record<AccentTheme, Record<ColorScheme, Tokens>> = Object.fromEntries(
  ACCENT_THEMES.map((t) => [t, { light: buildTokens(t, 'light'), dark: buildTokens(t, 'dark') }]),
) as Record<AccentTheme, Record<ColorScheme, Tokens>>;
