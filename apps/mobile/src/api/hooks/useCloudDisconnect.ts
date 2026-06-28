import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { CloudDisconnectResponse } from '@/api/schemas';

export function useCloudDisconnect() {
  const { state, signOut } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      return CloudDisconnectResponse.parse(await client.post('/api/settings/cloud/disconnect', {}));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cloud-settings'] }),
  });
}
