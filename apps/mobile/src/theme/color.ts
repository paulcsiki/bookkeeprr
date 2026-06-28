// Color helpers for translucent surfaces.
//
// RN on iOS does not reliably render alpha-blended `oklch(... / a)` (the same
// reason tokens.ts ships rgba fallbacks for status surfaces). The design tints
// content-type / accent surfaces at low alpha (pills, chips, glows), so we
// resolve a base token color to `rgba()` here:
//   - `hsl(h s% l%)` / `hsl(h, s%, l%)` → parsed and converted at runtime.
//   - `oklch(...)` → looked up from the precomputed table below (the fixed
//     content-type + status tokens; these never change across themes).
//   - already-`rgb`/`rgba`/`#hex` → used as the base, alpha applied when given.

// Precomputed sRGB for the fixed oklch tokens (see @bookkeeprr/tokens).
const OKLCH_RGB: Record<string, [number, number, number]> = {
  'oklch(0.72 0.17 18)': [253, 113, 124], // manga
  'oklch(0.78 0.13 220)': [54, 202, 241], // novel
  'oklch(0.80 0.16 75)': [249, 173, 38], // comic
  'oklch(0.74 0.14 160)': [71, 197, 140], // ebook
  'oklch(0.72 0.16 305)': [188, 136, 244], // audio
  'oklch(0.8 0.16 75)': [249, 173, 38], // comic (alt formatting)
  'oklch(0.74 0.14 152)': [93, 196, 126], // ok
  'oklch(0.8 0.15 78)': [242, 176, 54], // warn
  'oklch(0.66 0.2 24)': [244, 81, 82], // err
  'oklch(0.74 0.12 235)': [83, 182, 235], // info
};

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return [
    Math.round((rgb[0] + m) * 255),
    Math.round((rgb[1] + m) * 255),
    Math.round((rgb[2] + m) * 255),
  ];
}

function toRgb(color: string): [number, number, number] | null {
  const oklch = OKLCH_RGB[color.trim()];
  if (oklch) return oklch;
  const hsl = /^hsl\(\s*([\d.]+)[,\s]+([\d.]+)%[,\s]+([\d.]+)%/i.exec(color);
  if (hsl) return hslToRgb(parseFloat(hsl[1]!), parseFloat(hsl[2]!), parseFloat(hsl[3]!));
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(color);
  if (rgb) return [Math.round(+rgb[1]!), Math.round(+rgb[2]!), Math.round(+rgb[3]!)];
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    const h = hex[1]!;
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ];
  }
  return null;
}

/**
 * Resolve a token color to an `rgb()` string React Native can render. RN on iOS
 * does not render `oklch()` color strings — so the fixed content-type / status
 * tokens (defined as oklch in @bookkeeprr/tokens) must be converted before they
 * reach a `color`/`backgroundColor` prop. Falls back to the input if unknown.
 */
export function toRgbString(color: string): string {
  const rgb = toRgb(color);
  return rgb ? `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` : color;
}

/** Return the token `color` at opacity `alpha` (0–1) as an `rgba()` string. */
export function withAlpha(color: string, alpha: number): string {
  const rgb = toRgb(color);
  if (!rgb) return color;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

/**
 * Blend `fg` over `bg` at `ratio` (0–1) and return a SOLID `rgb()` string —
 * the design system requires solid surfaces (no rgba backgrounds), so tinted
 * tiles (e.g. a selected folder tile) compose a solid mix instead of stacking
 * alpha. Falls back to `withAlpha(fg, ratio)` if either color is unparseable.
 */
export function mixSolid(fg: string, bg: string, ratio: number): string {
  const f = toRgb(fg);
  const b = toRgb(bg);
  if (!f || !b) return withAlpha(fg, ratio);
  const mix = (i: 0 | 1 | 2) => Math.round(f[i] * ratio + b[i] * (1 - ratio));
  return `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`;
}

/** Deterministic hue (0–359) from a string — used for empty-cover backdrops. */
export function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}
