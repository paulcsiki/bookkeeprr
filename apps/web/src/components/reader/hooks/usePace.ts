'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import type { PaceResponse } from '@/app/api/reader/stats/pace/route';

/**
 * Fetches the user's reading pace from the server and returns a formatted
 * `paceLabel` string suitable for the FinishedView stats strip.
 *
 * - `"{n} pp/day"` when `pagesPerDay` is non-null.
 * - `"{n} min/day"` when `secondsPerDay` is non-null but `pagesPerDay` is null.
 * - `"—"` when fewer than 3 active reading days are on record.
 */
export function usePace(): { paceLabel: string; isLoading: boolean } {
  const { data, isLoading } = useQuery<PaceResponse>({
    queryKey: ['reader-pace'],
    queryFn: async () => {
      const res = await apiFetch('/api/reader/stats/pace');
      if (!res.ok) throw new Error(`pace fetch failed: HTTP ${res.status}`);
      return res.json() as Promise<PaceResponse>;
    },
    staleTime: 5 * 60_000, // 5 min — pace doesn't change rapidly
  });

  let paceLabel = '—';
  if (data) {
    if (data.pagesPerDay !== null) {
      paceLabel = `${Math.round(data.pagesPerDay)} pp/day`;
    } else if (data.secondsPerDay !== null) {
      paceLabel = `${Math.round(data.secondsPerDay / 60)} min/day`;
    }
  }

  return { paceLabel, isLoading };
}
