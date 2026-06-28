import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import type { DownloadsResponse } from '@/api/schemas';

/**
 * Cancel/dismiss a download by its qBittorrent hash (`DELETE /api/downloads/:hash`).
 *
 * The visible row is removed optimistically so it disappears the instant the
 * user swipes — without this, the 5s `useDownloads` poll would re-add it until
 * the server confirms the delete, making the swipe feel broken. On error the
 * previous cache is restored; on settle the list is re-validated.
 */
export function useDeleteDownload() {
  const { state, signOut } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (qbtHash: string) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      await client.delete(`/api/downloads/${encodeURIComponent(qbtHash)}`);
    },
    onMutate: async (qbtHash: string) => {
      await qc.cancelQueries({ queryKey: ['downloads'] });
      const prev = qc.getQueryData<DownloadsResponse>(['downloads']);
      if (prev) {
        qc.setQueryData<DownloadsResponse>(['downloads'], {
          ...prev,
          downloads: prev.downloads.filter((d) => d.qbtHash !== qbtHash),
        });
      }
      return { prev };
    },
    onError: (_err, _hash, ctx) => {
      if (ctx?.prev) qc.setQueryData(['downloads'], ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['downloads'] });
    },
  });
}
