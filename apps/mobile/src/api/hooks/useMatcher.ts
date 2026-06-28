import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { MatcherOverview } from '@/api/schemas';

// Combined GET /api/settings/matcher returns { weights, adultFilter } directly.
export function useMatcher() {
  const { state, signOut } = useAuth();
  return useQuery({
    enabled: state.status === 'authenticated',
    queryKey: ['matcher'],
    queryFn: async () => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      return MatcherOverview.parse(await client.get('/api/settings/matcher'));
    },
  });
}
