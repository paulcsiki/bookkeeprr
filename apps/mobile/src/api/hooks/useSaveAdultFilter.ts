import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { AdultFilterResponse, type AdultFilter } from '@/api/schemas';

// PATCH /api/settings/matcher/adult-filter → { config, autoReplayEnqueued? }.
export function useSaveAdultFilter() {
  const { state, signOut } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: AdultFilter) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      const raw = await client.patch('/api/settings/matcher/adult-filter', body);
      return AdultFilterResponse.parse(raw);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['matcher'] }),
  });
}
