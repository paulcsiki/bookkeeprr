'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';

/**
 * One continue-reading entry as served by `GET /api/reader/progress`. Typed
 * structurally here (rather than importing the server row type, which pulls in
 * Drizzle) so the client bundle stays clean.
 */
export type ContinueReadingItem = {
  readableKey: string;
  seriesId: number;
  volumeId: number | null;
  libraryFileId: number | null;
  contentType: string;
  position: number;
  finished: boolean;
  title: string | null;
  coverUrl: string | null;
};

type ContinueReadingResponse = { items: ContinueReadingItem[] };

/** Fetch the user's continue-reading list (most-recent first). */
export function useContinueReading(): UseQueryResult<ContinueReadingItem[], Error> {
  return useQuery<ContinueReadingItem[], Error>({
    queryKey: ['reader-continue'],
    queryFn: async () => {
      const r = await apiFetch('/api/reader/progress');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as ContinueReadingResponse;
      return data.items;
    },
  });
}
