import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { MatcherWeightsResponse, type MatcherWeights } from '@/api/schemas';

// PATCH /api/settings/matcher/weights → { config, autoReplayEnqueued? }.
export function useSaveMatcherWeights() {
  const { state, signOut } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: MatcherWeights) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      const raw = await client.patch('/api/settings/matcher/weights', body);
      return MatcherWeightsResponse.parse(raw);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['matcher'] }),
  });
}
