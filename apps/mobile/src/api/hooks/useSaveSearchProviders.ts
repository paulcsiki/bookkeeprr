import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import type { SearchProviders } from '@/api/schemas';

/**
 * Saves the full search-provider enable/disable object.
 * PUT `/api/settings/search-providers` requires the complete strict boolean shape —
 * no partials, no extra keys. Invalidates the matching `useSearchProviders` query
 * on success.
 */
export function useSaveSearchProviders() {
  const { state, signOut } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (providers: SearchProviders) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      return client.put('/api/settings/search-providers', providers);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['search-providers'] }),
  });
}
