/**
 * Pure drag-and-drop hit-test math for tablet library groups.
 * No React, no reanimated imports — unit-tested in isolation. `hitTestList`
 * carries a 'worklet' directive so the pan gesture can hit-test on the UI
 * thread against a shared-value mirror of the frames map.
 *
 * Drop-target ids encode their destination:
 *   `group-<id>`  — a folder card (move into that group)
 *   `crumb-<id>`  — a breadcrumb pill (move into that ancestor group)
 *   `crumb-root`  — the Library crumb (move to the library root, groupId null)
 */

export type DropFrame = { id: string; x: number; y: number; w: number; h: number };

/** Insert or replace (by id) a measured drop frame. Returns the same map. */
export function registerFrame(
  frames: Map<string, DropFrame>,
  f: DropFrame,
): Map<string, DropFrame> {
  frames.set(f.id, f);
  return frames;
}

/**
 * Point-in-rect test over a plain array of frames (the shape mirrored into a
 * reanimated shared value). Edges inclusive; when frames overlap the
 * LAST-registered one wins (array order = registration order).
 */
export function hitTestList(frames: readonly DropFrame[], x: number, y: number): string | null {
  'worklet';
  let hit: string | null = null;
  for (const f of frames) {
    if (x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h) hit = f.id;
  }
  return hit;
}

/** Map-based variant for JS-side callers; same precedence rules. */
export function hitTest(frames: Map<string, DropFrame>, x: number, y: number): string | null {
  return hitTestList(Array.from(frames.values()), x, y);
}

/**
 * Decode a drop-target id into the move destination. Returns null when the id
 * is not a recognised target (the drop is a miss → spring back).
 */
export function decodeDropTarget(id: string): { groupId: number | null } | null {
  if (id === 'crumb-root') return { groupId: null };
  const m = /^(?:group|crumb)-(\d+)$/.exec(id);
  return m ? { groupId: Number(m[1]) } : null;
}

/**
 * Decide whether a drag should actually fire a PATCH.
 *
 * Rules that mirror finishDrag:
 *   - no target (spring-back)          → false
 *   - target decodes to unrecognised   → false (miss)
 *   - target groupId === series groupId → false (same-group no-op)
 *   - otherwise                        → true
 */
export function shouldMove(
  seriesGroupId: number | null,
  targetId: string | null,
): boolean {
  if (targetId === null) return false;
  const decoded = decodeDropTarget(targetId);
  if (decoded === null) return false;
  return decoded.groupId !== seriesGroupId;
}
