export type AcquisitionState = 'missing' | 'partial' | 'complete';

/**
 * Classify a series' acquisition state from owned vs. total volume counts.
 *
 * - `owned === 0` → `missing` (nothing acquired yet)
 * - `total > 0 && owned >= total` → `complete` (everything known is owned)
 * - otherwise → `partial` (some owned, but not all / total unknown)
 *
 * When `total` is 0 (no volume info yet) a non-zero `owned` reads as `partial`.
 */
export function acquisitionState(owned: number, total: number): AcquisitionState {
  if (owned === 0) return 'missing';
  if (total > 0 && owned >= total) return 'complete';
  return 'partial';
}
