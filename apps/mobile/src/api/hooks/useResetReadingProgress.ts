import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';

/**
 * Reset (delete) the reading progress for a readable, keyed by its
 * `readableKey`. This clears the saved position for that volume/file and drops
 * it from the Continue-Reading list. Invalidates the continue-reading query on
 * success so the rail refreshes.
 */
export function useResetReadingProgress() {
  const { state, signOut } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (readableKey: string) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      await client.delete(`/api/reader/progress/${encodeURIComponent(readableKey)}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['continue-reading'] });
    },
  });
}
