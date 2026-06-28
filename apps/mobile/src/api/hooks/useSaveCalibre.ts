import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import type { CalibreConfig } from '@/api/schemas';

// Omit `configured` — it's computed server-side, not sent in PATCH body
type CalibrePatch = Omit<CalibreConfig, 'configured'>;

export function useSaveCalibre() {
  const { state, signOut } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CalibrePatch) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      await client.patch('/api/settings/library-sync/calibre', body);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['calibre'] }),
  });
}
