/**
 * Pure zoom + pan math for the comics reader. No DOM, no React — safe to
 * unit-test in a node environment. The component wires these to wheel / pointer
 * / double-click handlers; the math lives here so it stays testable and so the
 * web and mobile readers can share the exact same shape (parity is asserted by
 * mirrored unit-test vectors under each app's `tests/unit/reader/zoom.test.ts`).
 */

/** Minimum zoom scale (fit-to-page). */
export const ZOOM_MIN = 1;
/** Maximum zoom scale. */
export const ZOOM_MAX = 3;

/** A 2-D pan offset in CSS/layout pixels, measured from the centered origin. */
export interface Pan {
  x: number;
  y: number;
}

/** A 2-D size in CSS/layout pixels. */
export interface Size {
  w: number;
  h: number;
}

/** Clamp a zoom scale into the `[ZOOM_MIN, ZOOM_MAX]` range; NaN → min. */
export function clampZoom(scale: number): number {
  if (Number.isNaN(scale)) return ZOOM_MIN;
  if (scale < ZOOM_MIN) return ZOOM_MIN;
  if (scale > ZOOM_MAX) return ZOOM_MAX;
  return scale;
}

/**
 * Double-click / double-tap toggle: zoom from fit (1×) to 2×, or back to 1×
 * from any zoomed state.
 */
export function toggleZoom(current: number): number {
  return current > ZOOM_MIN ? ZOOM_MIN : 2;
}

/**
 * The maximum pan magnitude on one axis: half the amount by which the scaled
 * content overflows the container. When the content fits (content ≤ container)
 * there is no room to pan, so the bound is 0.
 */
export function panBound(container: number, content: number): number {
  return Math.max(0, (content - container) / 2);
}

/**
 * Clamp a pan offset so the scaled content can't be dragged past the container
 * edges. Each axis is clamped to `±panBound`; when an axis fits, it pins to 0
 * (centered).
 */
export function clampPan(pan: Pan, container: Size, content: Size): Pan {
  const bx = panBound(container.w, content.w);
  const by = panBound(container.h, content.h);
  // `|| 0` normalizes a `-0` (from clamping to a zero bound) to `+0`.
  return {
    x: Math.max(-bx, Math.min(bx, pan.x)) || 0,
    y: Math.max(-by, Math.min(by, pan.y)) || 0,
  };
}
