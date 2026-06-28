import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { GrabResponse } from '@/api/schemas';

export function useGrabRelease() {
  const { state, signOut } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (releaseId: number) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      const raw = await client.post(`/api/releases/${releaseId}/grab`, {});
      return GrabResponse.parse(raw);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}
