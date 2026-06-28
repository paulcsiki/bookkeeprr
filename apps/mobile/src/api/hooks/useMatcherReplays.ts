import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { ReplayRunsResponse, ReplayRunDetailResponse } from '@/api/schemas';

// Recent matcher replay runs (newest first).
// GET /api/settings/matcher/replays?limit=N → { runs }.
export function useMatcherReplays(limit = 20) {
  const { state, signOut } = useAuth();
  return useQuery({
    enabled: state.status === 'authenticated',
    queryKey: ['matcher-replays', limit],
    queryFn: async () => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      return ReplayRunsResponse.parse(
        await client.get(`/api/settings/matcher/replays?limit=${limit}`),
      );
    },
  });
}

// One replay run + its per-release outcome rows (all kinds, first page).
// GET /api/settings/matcher/replays/:runId?page=0&pageSize=200 → { run, rows, total }.
// 200 is the server's pageSize ceiling — plenty for the mobile detail sheet.
export function useMatcherReplayDetail(runId: number | null) {
  const { state, signOut } = useAuth();
  return useQuery({
    enabled: state.status === 'authenticated' && runId !== null,
    queryKey: ['matcher-replay', runId],
    queryFn: async () => {
      if (state.status !== 'authenticated' || runId === null) {
        throw new Error('unauthenticated');
      }
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      return ReplayRunDetailResponse.parse(
        await client.get(`/api/settings/matcher/replays/${runId}?page=0&pageSize=200`),
      );
    },
  });
}
