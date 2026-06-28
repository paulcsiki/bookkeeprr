/**
 * Design tokens for bookkeeprr — JS mirror of tokens.css.
 *
 * Web consumers: use the CSS file (`import '@bookkeeprr/tokens/tokens.css'`)
 * and reference the values as CSS custom properties (`var(--color-primary)`).
 * React Native consumers: use this JS object (RN has no CSS variables).
 *
 * When you change a value, change it in BOTH files. Drift is caught by
 * code review — the set is small enough that we don't need codegen.
 */
export const colors = {
  // neutrals
  background: 'hsl(240 10% 4%)',
  foreground: 'hsl(0 0% 95%)',
  card: 'hsl(240 10% 6%)',
  cardForeground: 'hsl(0 0% 95%)',
  popover: 'hsl(240 10% 6%)',
  popoverForeground: 'hsl(0 0% 95%)',
  secondary: 'hsl(240 6% 12%)',
  secondaryForeground: 'hsl(0 0% 95%)',
  muted: 'hsl(240 6% 12%)',
  mutedForeground: 'hsl(240 5% 65%)',
  accent: 'hsl(240 6% 14%)',
  accentForeground: 'hsl(0 0% 95%)',
  destructive: 'hsl(0 70% 50%)',
  destructiveForeground: 'hsl(0 0% 100%)',
  border: 'hsl(240 5% 16%)',
  input: 'hsl(240 5% 18%)',

  // primary — themable; default violet
  primary: 'hsl(263 70% 60%)',
  primaryForeground: 'hsl(0 0% 100%)',
  ring: 'hsl(263 70% 60%)',

  // content-type accents — fixed across themes
  manga: 'oklch(0.72 0.17 18)',
  novel: 'oklch(0.78 0.13 220)',
  comic: 'oklch(0.8 0.16 75)',
  ebook: 'oklch(0.74 0.14 160)',
  audio: 'oklch(0.72 0.16 305)',

  // status
  ok: 'oklch(0.74 0.14 152)',
  warn: 'oklch(0.8 0.15 78)',
  err: 'oklch(0.66 0.2 24)',
  info: 'oklch(0.74 0.12 235)',
} as const;

export type ColorToken = keyof typeof colors;

/** Theme variants — name → primary/ring/primaryForeground overrides. */
export const themes = {
  violet: { primary: 'hsl(263 70% 60%)', ring: 'hsl(263 70% 60%)' },
  amber: {
    primary: 'hsl(38 82% 58%)',
    ring: 'hsl(38 82% 58%)',
    primaryForeground: 'hsl(38 30% 10%)',
  },
  rose: { primary: 'hsl(348 80% 62%)', ring: 'hsl(348 80% 62%)' },
  teal: { primary: 'hsl(174 70% 50%)', ring: 'hsl(174 70% 50%)' },
  sky: { primary: 'hsl(208 90% 62%)', ring: 'hsl(208 90% 62%)' },
  lime: {
    primary: 'hsl(96 62% 56%)',
    ring: 'hsl(96 62% 56%)',
    primaryForeground: 'hsl(96 30% 10%)',
  },
  mono: {
    primary: 'hsl(0 0% 90%)',
    ring: 'hsl(0 0% 90%)',
    primaryForeground: 'hsl(240 10% 6%)',
  },
} as const;

export type ThemeName = keyof typeof themes;

export const radius = '0.5rem';
