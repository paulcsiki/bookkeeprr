import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { AutoGrabResponse, type AutoGrabConfig } from '@/api/schemas';

export function useSaveAutoGrab() {
  const { state, signOut } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<AutoGrabConfig>) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      return AutoGrabResponse.parse(await client.patch('/api/settings/auto-grab', patch));
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['auto-grab'] }),
  });
}
