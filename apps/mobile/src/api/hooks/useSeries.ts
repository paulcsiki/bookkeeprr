import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { SeriesDetail } from '@/api/schemas';

/** Poll interval (ms) while the server reports background enrichment running. */
const HYDRATING_POLL_MS = 4_000;

export function useSeries(seriesId: number | undefined) {
  const { state, signOut } = useAuth();
  return useQuery({
    enabled: state.status === 'authenticated' && typeof seriesId === 'number',
    queryKey: ['series', seriesId],
    queryFn: async () => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      const raw = await client.get(`/api/series/${seriesId}`);
      return SeriesDetail.parse(raw);
    },
    // Poll while the server signals background enrichment is running so the UI
    // automatically updates (cover/description/volumes) when the job finishes.
    // The interval is driven by the PREVIOUS response, so the first fetch always
    // runs immediately; subsequent polls happen only while hydrating is true.
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.hydrating === true ? HYDRATING_POLL_MS : false;
    },
  });
}
