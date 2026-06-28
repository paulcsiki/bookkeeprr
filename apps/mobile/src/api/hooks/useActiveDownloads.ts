import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { DownloadsResponse, type Download } from '@/api/schemas';

const ACTIVE_STATUSES = new Set<string>(['downloading', 'queued']);

export function useActiveDownloads(): {
  items: Download[];
  isLoading: boolean;
  isError: boolean;
} {
  const { state, signOut } = useAuth();
  const result = useQuery({
    enabled: state.status === 'authenticated',
    queryKey: ['downloads', 'active'],
    queryFn: async () => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      const raw = await client.get('/api/downloads');
      const parsed = DownloadsResponse.parse(raw);
      return parsed.downloads.filter((d) => ACTIVE_STATUSES.has(d.status));
    },
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });

  return {
    items: result.data ?? [],
    isLoading: result.isLoading,
    isError: result.isError,
  };
}
