/**
 * Pure tap-zone + paging helpers for the comics reader. No DOM, no React —
 * safe to unit-test in a node environment. The component wires these to pointer
 * coordinates and keyboard events; the math lives here so it stays testable.
 */

/** Center dead-zone bounds (fraction of width). A tap inside toggles chrome. */
const CENTER_LO = 0.32;
const CENTER_HI = 0.68;

export type TapAction = 'forward' | 'back' | 'toggle';

/**
 * Resolve a horizontal tap into a paging action.
 *
 * `relX` is the tap's x-fraction across the page (0 = left edge, 1 = right).
 * The center band (`CENTER_LO`..`CENTER_HI`) toggles chrome. Otherwise the edge
 * tapped maps to forward/back through the reading direction: in LTR the right
 * edge advances; in RTL the left edge advances.
 */
export function tapAction(relX: number, rtl: boolean): TapAction {
  if (relX > CENTER_LO && relX < CENTER_HI) return 'toggle';
  const tappedRight = relX >= CENTER_HI;
  const forward = rtl ? !tappedRight : tappedRight;
  return forward ? 'forward' : 'back';
}

function clampIndex(idx: number, count: number): number {
  if (count <= 0) return 0;
  if (idx < 0) return 0;
  if (idx > count - 1) return count - 1;
  return idx;
}

/** Advance `idx` by `step` pages, clamped to the document. */
export function nextIndex(idx: number, count: number, step: number): number {
  return clampIndex(idx + step, count);
}

/** Retreat `idx` by `step` pages, clamped to the document. */
export function prevIndex(idx: number, count: number, step: number): number {
  return clampIndex(idx - step, count);
}

/**
 * The page pair shown in a two-up spread, ordered for the reading direction.
 * LTR shows `[idx, idx+1]` (left→right); RTL shows `[idx+1, idx]` so the
 * higher-numbered page sits on the right. The caller filters out-of-range
 * indices before rendering.
 */
export function pagePair(idx: number, rtl: boolean): [number, number] {
  return rtl ? [idx + 1, idx] : [idx, idx + 1];
}
