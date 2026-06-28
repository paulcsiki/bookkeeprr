import type { SeriesRow } from '@/server/db/schema';

type MonitoringFacts = Pick<SeriesRow, 'monitoring' | 'status' | 'totalVolumes'>;

/**
 * True when a series is on `future` monitoring but can never receive a future
 * release, so `future` is a no-op and should drop to `none`:
 *
 *  - a finished or cancelled series — publication is over, and
 *  - a single book (`totalVolumes === 1`) — a standalone ebook / novel / etc.
 *    that has no "next volume" to wait for.
 *
 * Only `future` is touched; `all` / `missing` / `none` are left as the user set
 * them (those modes still have meaning — re-grabbing missing volumes, etc.).
 *
 * Pure (no DB) so it stays unit-testable and import-cycle-free.
 */
export function shouldAutoDisableFutureMonitoring(series: MonitoringFacts): boolean {
  if (series.monitoring !== 'future') return false;
  if (series.status === 'finished' || series.status === 'cancelled') return true;
  if (series.totalVolumes != null && series.totalVolumes <= 1) return true;
  return false;
}
