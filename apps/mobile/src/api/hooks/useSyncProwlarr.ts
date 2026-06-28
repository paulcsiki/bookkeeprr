import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { ProwlarrSyncResult } from '@/api/schemas';

interface SyncProwlarrVars {
  // Both optional: when supplied the server persists them as the stored
  // connection; otherwise it uses the already-stored url/apiKey.
  url?: string;
  apiKey?: string;
}

export function useSyncProwlarr() {
  const { state, signOut } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: SyncProwlarrVars) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      return ProwlarrSyncResult.parse(await client.post('/api/indexers/prowlarr/sync', vars));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['indexers'] });
    },
  });
}
