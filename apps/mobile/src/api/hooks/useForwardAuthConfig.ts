import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { ForwardAuthConfigResponse } from '@/api/schemas';

export function useForwardAuthConfig() {
  const { state, signOut } = useAuth();
  return useQuery({
    enabled: state.status === 'authenticated',
    queryKey: ['forward-auth-config'],
    queryFn: async () => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      return ForwardAuthConfigResponse.parse(await client.get('/api/auth/forward-auth/config'));
    },
  });
}
