import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { UpdatesConfigResponse, type UpdatesConfig } from '@/api/schemas';

export function useUpdateUpdatesSettings() {
  const { state, signOut } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<UpdatesConfig>) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      return UpdatesConfigResponse.parse(await client.patch('/api/settings/updates', patch));
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['updates-overview'] }),
  });
}
