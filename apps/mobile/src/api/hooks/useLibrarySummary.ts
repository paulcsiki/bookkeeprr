import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { LibrarySummaryResponse } from '@/api/schemas';

export function useLibrarySummary() {
  const { state, signOut } = useAuth();
  return useQuery({
    enabled: state.status === 'authenticated',
    queryKey: ['library-summary'],
    queryFn: async () => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      const raw = await client.get('/api/library/summary');
      return LibrarySummaryResponse.parse(raw);
    },
    // Refresh every 5 minutes — advisory data, not realtime critical.
    staleTime: 5 * 60 * 1_000,
  });
}
