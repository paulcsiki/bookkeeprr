import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { InteractiveSearchResponse } from '@/api/schemas';

export function useInteractiveSearch(seriesId: number | undefined) {
  const { state, signOut } = useAuth();
  return useQuery({
    enabled: state.status === 'authenticated' && typeof seriesId === 'number',
    queryKey: ['interactive', seriesId],
    queryFn: async () => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      const raw = await client.post('/api/search/interactive', { seriesId });
      return InteractiveSearchResponse.parse(raw);
    },
    staleTime: 15_000,
  });
}
