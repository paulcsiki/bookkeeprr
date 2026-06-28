import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { FlaresolverrConfig } from '@/api/schemas';

export function useFlaresolverr() {
  const { state, signOut } = useAuth();
  return useQuery({
    enabled: state.status === 'authenticated',
    queryKey: ['flaresolverr'],
    queryFn: async () => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      // GET returns the config directly (not wrapped).
      return FlaresolverrConfig.parse(await client.get('/api/settings/flaresolverr'));
    },
  });
}
