/**
 * Returns a consistent hue-based CSS gradient string for cover/card backgrounds.
 * Uses `hsl()` throughout — no OKLCH literals — so any CSS processor can handle it.
 *
 * @param hue  Hue angle in degrees (0-360).
 */
export function hueGradient(hue: number): string {
  return `linear-gradient(158deg, hsl(${hue} 42% 26%), hsl(${hue} 38% 13%) 65%, hsl(240 10% 7%))`;
}
