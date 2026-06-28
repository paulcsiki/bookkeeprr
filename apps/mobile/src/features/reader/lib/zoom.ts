/**
 * Pure zoom + pan math for the comics reader. No React Native, no gesture
 * handler — safe to unit-test in a node environment. The component wires these
 * to pinch / pan / double-tap gestures; the math lives here so it stays testable
 * and so the mobile and web readers share the exact same shape.
 *
 * Ported verbatim from the web reader (`apps/web/src/components/reader/lib/
 * zoom.ts`) to keep web/mobile parity; the web unit-test vectors are mirrored
 * under `tests/unit/reader/zoom.test.ts`.
 */

/** Minimum zoom scale (fit-to-page). */
export const ZOOM_MIN = 1;
/** Maximum zoom scale. */
export const ZOOM_MAX = 3;

/** A 2-D pan offset in layout pixels, measured from the centered origin. */
export interface Pan {
  x: number;
  y: number;
}

/** A 2-D size in layout pixels. */
export interface Size {
  w: number;
  h: number;
}

/**
 * Clamp a zoom scale into the `[ZOOM_MIN, ZOOM_MAX]` range; NaN → min.
 * Marked a worklet: it's called from the pinch gesture's onUpdate on the UI
 * thread, where invoking a non-worklet aborts the app (reanimated throws an
 * uncaught error → SIGABRT). The directive is a no-op under jest/node.
 */
export function clampZoom(scale: number): number {
  'worklet';
  if (Number.isNaN(scale)) return ZOOM_MIN;
  if (scale < ZOOM_MIN) return ZOOM_MIN;
  if (scale > ZOOM_MAX) return ZOOM_MAX;
  return scale;
}

/**
 * Double-tap / double-click toggle: zoom from fit (1×) to 2×, or back to 1×
 * from any zoomed state. Worklet — runs in the double-tap gesture on the UI
 * thread (see {@link clampZoom}).
 */
export function toggleZoom(current: number): number {
  'worklet';
  return current > ZOOM_MIN ? ZOOM_MIN : 2;
}

/**
 * The maximum pan magnitude on one axis: half the amount by which the scaled
 * content overflows the container. When the content fits (content ≤ container)
 * there is no room to pan, so the bound is 0.
 */
export function panBound(container: number, content: number): number {
  'worklet';
  return Math.max(0, (content - container) / 2);
}

/**
 * Clamp a pan offset so the scaled content can't be dragged past the container
 * edges. Each axis is clamped to `±panBound`; when an axis fits, it pins to 0
 * (centered).
 */
export function clampPan(pan: Pan, container: Size, content: Size): Pan {
  'worklet';
  const bx = panBound(container.w, content.w);
  const by = panBound(container.h, content.h);
  // `|| 0` normalizes a `-0` (from clamping to a zero bound) to `+0`.
  return {
    x: Math.max(-bx, Math.min(bx, pan.x)) || 0,
    y: Math.max(-by, Math.min(by, pan.y)) || 0,
  };
}
