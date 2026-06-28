import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { ApiKeyState } from '@/api/schemas';

export function useMutateApiKey() {
  const { state, signOut } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (action: 'generate' | 'disable') => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      return ApiKeyState.parse(await client.patch('/api/settings/api-key', { action }));
    },
    onSuccess: (data) => qc.setQueryData(['api-key'], data),
  });
}
