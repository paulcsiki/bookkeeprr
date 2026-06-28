'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';

/** A single day in the weekly chart, as served by `GET /api/reader/stats`. */
export type ReadingStatsDay = { day: string; secondsRead: number; unitsRead: number };

/** The shape of `GET /api/reader/stats`. */
export type ReadingStats = {
  days: ReadingStatsDay[];
  totalSeconds: number;
  totalUnits: number;
  streak: number;
  pacePerHour: number | null;
};

/** Fetch the user's last-7-days reading stats (totals, streak, pace). */
export function useReadingStats(): UseQueryResult<ReadingStats, Error> {
  return useQuery<ReadingStats, Error>({
    queryKey: ['reader-stats'],
    queryFn: async () => {
      const r = await apiFetch('/api/reader/stats');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as ReadingStats;
    },
  });
}
