import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { DashboardPrefs } from '@/api/schemas';

/** Fetch the user's dashboard widget prefs (order + enabled), shared with web. */
export function useDashboardPrefs() {
  const { state, signOut } = useAuth();
  return useQuery({
    enabled: state.status === 'authenticated',
    queryKey: ['dashboard-prefs'],
    queryFn: async () => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      return DashboardPrefs.parse(await client.get('/api/dashboard/prefs'));
    },
  });
}

/** Persist the full prefs (the API validates a complete order + enabled map). */
export function useSetDashboardPrefs() {
  const { state, signOut } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (prefs: DashboardPrefs) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      return DashboardPrefs.parse(await client.put('/api/dashboard/prefs', prefs));
    },
    onSuccess: (next) => {
      qc.setQueryData(['dashboard-prefs'], next);
    },
  });
}
