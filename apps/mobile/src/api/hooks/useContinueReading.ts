import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { ContinueReadingResponse } from '@/api/schemas';

/**
 * Fetch + validate the Continue-Reading list (the user's most-recently-touched
 * readables with their progress, newest first).
 */
export function useContinueReading() {
  const { state, signOut } = useAuth();
  return useQuery({
    enabled: state.status === 'authenticated',
    queryKey: ['continue-reading'],
    queryFn: async () => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      const raw = await client.get('/api/reader/progress');
      return ContinueReadingResponse.parse(raw);
    },
  });
}
