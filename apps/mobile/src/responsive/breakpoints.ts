export type LayoutClass = 'phone' | 'tablet-portrait' | 'tablet-landscape';

export const BREAKPOINTS = {
  tabletMinWidth: 600,
  landscapeMinWidth: 900,
} as const;

// Shared max width for the left-aligned detail-hero poster on tablet. The
// full-bleed `flush` hero used on phones balloons to fill a wide pane, so on
// tablet both series/collection detail screens cap the poster at this width and
// align it to the start of the pane. Single source of truth for both screens.
export const DETAIL_HERO_MAX_WIDTH = 340;

export function classFor(width: number, _height: number): LayoutClass {
  if (width < BREAKPOINTS.tabletMinWidth) return 'phone';
  if (width < BREAKPOINTS.landscapeMinWidth) return 'tablet-portrait';
  return 'tablet-landscape';
}
