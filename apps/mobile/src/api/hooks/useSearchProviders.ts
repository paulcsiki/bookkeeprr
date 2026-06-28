import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { SearchProviders } from '@/api/schemas';

/**
 * Fetches the current search-provider enable/disable flags.
 * GET `/api/settings/search-providers` returns the 7-boolean object directly.
 */
export function useSearchProviders() {
  const { state, signOut } = useAuth();
  return useQuery({
    enabled: state.status === 'authenticated',
    queryKey: ['search-providers'],
    queryFn: async () => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      return SearchProviders.parse(await client.get('/api/settings/search-providers'));
    },
  });
}
