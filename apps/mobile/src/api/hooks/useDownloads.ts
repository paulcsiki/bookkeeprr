import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { DownloadsResponse } from '@/api/schemas';

export function useDownloads() {
  const { state, signOut } = useAuth();
  return useQuery({
    enabled: state.status === 'authenticated',
    queryKey: ['downloads'],
    queryFn: async () => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      const raw = await client.get('/api/downloads');
      return DownloadsResponse.parse(raw);
    },
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });
}
