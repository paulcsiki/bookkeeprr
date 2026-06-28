import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { ProwlarrConfig } from '@/api/schemas';

export function useProwlarrConfig() {
  const { state, signOut } = useAuth();
  return useQuery({
    enabled: state.status === 'authenticated',
    queryKey: ['prowlarr'],
    queryFn: async () => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      // GET returns { url, apiKey } directly; apiKey is masked to '****' when set, '' otherwise.
      return ProwlarrConfig.parse(await client.get('/api/settings/prowlarr'));
    },
  });
}
