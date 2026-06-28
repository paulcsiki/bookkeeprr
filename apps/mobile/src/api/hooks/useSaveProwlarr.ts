import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import type { ProwlarrConfig } from '@/api/schemas';

export function useSaveProwlarr() {
  const { state, signOut } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    // body.apiKey blank (or the masked '****') tells the server to keep the stored key.
    mutationFn: async (body: ProwlarrConfig) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      await client.put('/api/settings/prowlarr', body);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['prowlarr'] }),
  });
}
