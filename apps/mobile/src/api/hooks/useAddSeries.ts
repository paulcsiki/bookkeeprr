import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';

/**
 * Create a series from a `POST /api/series` body. Build the body with
 * `buildAddBody` (content-type-specific shape) — the older flat
 * `{sourceId, contentType}` shape was never accepted by the server.
 */
export function useAddSeries() {
  const { state, signOut } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      return client.post('/api/series', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['library'] });
    },
  });
}
