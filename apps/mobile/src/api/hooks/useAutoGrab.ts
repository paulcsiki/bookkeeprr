import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { AutoGrabConfig } from '@/api/schemas';

export function useAutoGrab() {
  const { state, signOut } = useAuth();
  return useQuery({
    enabled: state.status === 'authenticated',
    queryKey: ['auto-grab'],
    queryFn: async () => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      // GET returns the config directly (not `{config}`-wrapped).
      return AutoGrabConfig.parse(await client.get('/api/settings/auto-grab'));
    },
  });
}
