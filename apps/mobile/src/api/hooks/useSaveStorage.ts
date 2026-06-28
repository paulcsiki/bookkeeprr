import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import type { StorageSettings } from '@/api/schemas/library';

export function useSaveStorage() {
  const { state, signOut } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: StorageSettings) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      await client.put('/api/settings/storage', body);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['storage'] }),
  });
}
