import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import type { UpdateIndexerBody } from '@/api/schemas';

type UpdateIndexerVars = UpdateIndexerBody & { id: number };

export function useUpdateIndexer() {
  const { state, signOut } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: UpdateIndexerVars) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      await client.patch(`/api/indexers/${id}`, patch);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['indexers'] });
    },
  });
}
