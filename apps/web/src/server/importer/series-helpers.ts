/**
 * Helpers shared between the /api/series route and the importer adopt path.
 * Lives in the importer package so adopt.ts can import without a circular dep
 * (route → importer is safe; importer → route would not be).
 */

import { enqueueJob } from '@/server/db/jobs';
import { runUntilIdle } from '@/server/jobs/runner';
import type { JobKindDescriptor } from '@/server/jobs/types';

export function sanitizeForFs(s: string): string {
  return s
    .replace(/[/\\:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Kick the just-enqueued hydrate job(s) immediately instead of waiting for the
 * per-minute worker tick, so the newly-added series page fills in within ~1s.
 * Fire-and-forget (not awaited) — the response is unchanged. Safe to run
 * alongside the worker: `claimNextJob` is an atomic immediate transaction and
 * the hydrate handlers are idempotent, so neither can double-process. Skipped
 * under Vitest to keep enqueue assertions deterministic; the worker tick remains
 * the fallback if this run is interrupted.
 */
export function kickHydrate(
  ...descriptors: JobKindDescriptor<{ seriesId: number }, unknown>[]
): void {
  if (process.env.VITEST) return;
  for (const d of descriptors) {
    void runUntilIdle(d).catch(() => {});
  }
}

/**
 * Enqueue a per-series release search so the Releases tab fills promptly after
 * add, rather than waiting for the global RSS poll. Skipped for unmonitored
 * series (audiobooks/single items that opt out via explicit 'none').
 * Mirror of insertSeries' default: undefined → 'all' = monitored; only the
 * explicit 'none' opt-out skips the search.
 */
export async function enqueueReleaseSearchOnAdd(
  seriesId: number,
  monitoring: string | undefined,
): Promise<void> {
  if (monitoring === 'none') return;
  await enqueueJob('series_release_search', { seriesId });
}
