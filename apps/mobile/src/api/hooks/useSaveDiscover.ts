import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import type { DiscoverSettings } from '@/api/schemas/library';

export function useSaveDiscover() {
  const { state, signOut } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: DiscoverSettings) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      await client.put('/api/settings/discover', body);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['discover'] }),
  });
}
