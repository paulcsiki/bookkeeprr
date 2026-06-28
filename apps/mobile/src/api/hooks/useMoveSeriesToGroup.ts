import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';

export function useMoveSeriesToGroup() {
  const { state, signOut } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ seriesId, groupId }: { seriesId: number; groupId: number | null }) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      return client.patch(`/api/series/${seriesId}`, { groupId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['library-groups'] });
      qc.invalidateQueries({ queryKey: ['library'] });
      qc.invalidateQueries({ queryKey: ['series'] });
    },
  });
}
