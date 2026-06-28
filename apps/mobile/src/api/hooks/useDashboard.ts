import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { DashboardResponse } from '@/api/schemas';

export type DashboardRange = 'week' | 'month' | 'year' | 'all';

/** Fetch + validate the Home dashboard payload (stats, goals, leaderboard, …). */
export function useDashboard(range: DashboardRange = 'week') {
  const { state, signOut } = useAuth();
  return useQuery({
    enabled: state.status === 'authenticated',
    queryKey: ['dashboard', range],
    queryFn: async () => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      const raw = await client.get(`/api/dashboard?range=${range}`);
      return DashboardResponse.parse(raw);
    },
  });
}
