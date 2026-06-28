import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import type { AudiobookshelfConfig } from '@/api/schemas';

// Omit `configured` — it's computed server-side, not sent in PATCH body
type AudiobookshelfPatch = Omit<AudiobookshelfConfig, 'configured'>;

export function useSaveAudiobookshelf() {
  const { state, signOut } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: AudiobookshelfPatch) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      await client.patch('/api/settings/library-sync/audiobookshelf', body);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['abs'] }),
  });
}
