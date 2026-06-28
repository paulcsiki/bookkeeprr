import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { HousekeepingOverview } from '@/api/schemas';

// Combined GET — the four retention configs come back directly (not wrapped),
// see apps/web/src/app/api/settings/housekeeping/route.ts.
export function useHousekeeping() {
  const { state, signOut } = useAuth();
  return useQuery({
    enabled: state.status === 'authenticated',
    queryKey: ['housekeeping'],
    queryFn: async () => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      return HousekeepingOverview.parse(await client.get('/api/settings/housekeeping'));
    },
  });
}
