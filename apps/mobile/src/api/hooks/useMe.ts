import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { MeResponse } from '@/api/schemas';

/**
 * The signed-in user's real identity (display name + email), resolved from the
 * bearer token via GET /api/mobile/me. Used for the account header so it shows
 * the actual name and a Gravatar instead of a synthetic URL-derived identity.
 */
export function useMe() {
  const { state, signOut } = useAuth();
  return useQuery({
    enabled: state.status === 'authenticated',
    queryKey: ['me'],
    queryFn: async () => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      return MeResponse.parse(await client.get('/api/mobile/me'));
    },
    staleTime: 5 * 60_000,
  });
}
