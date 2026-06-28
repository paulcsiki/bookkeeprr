import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';

const PaceResponse = z.object({
  pagesPerDay: z.number().nullable(),
  secondsPerDay: z.number().nullable(),
  days: z.number(),
});

/**
 * Fetches the user's reading pace and returns a formatted paceLabel.
 *
 * - `"{n} pp/day"` when pagesPerDay is non-null.
 * - `"{n} min/day"` when secondsPerDay is non-null but pagesPerDay is null.
 * - `"—"` when fewer than 3 active reading days are on record.
 */
export function usePace(): { paceLabel: string; isLoading: boolean } {
  const { state, signOut } = useAuth();
  const enabled = state.status === 'authenticated';

  const { data, isLoading } = useQuery({
    enabled,
    queryKey: ['reader-pace'],
    queryFn: async () => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      const raw = await client.get('/api/reader/stats/pace');
      return PaceResponse.parse(raw);
    },
    staleTime: 5 * 60_000, // 5 min
  });

  let paceLabel = '—';
  if (data) {
    if (data.pagesPerDay !== null) {
      paceLabel = `${Math.round(data.pagesPerDay)} pp/day`;
    } else if (data.secondsPerDay !== null) {
      paceLabel = `${Math.round(data.secondsPerDay / 60)} min/day`;
    }
  }

  return { paceLabel, isLoading: enabled && isLoading };
}
