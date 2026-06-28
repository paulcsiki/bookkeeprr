import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import type { FlaresolverrConfig } from '@/api/schemas';

export function useSaveFlaresolverr() {
  const { state, signOut } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: FlaresolverrConfig) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      await client.put('/api/settings/flaresolverr', body);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['flaresolverr'] }),
  });
}
