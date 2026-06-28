import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { ForwardAuthConfigResponse, type ForwardAuthConfig } from '@/api/schemas';

export function useUpdateForwardAuthConfig() {
  const { state, signOut } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<ForwardAuthConfig>) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      // On 422 the thrown ApiError.body carries the failure detail (invalid_cidr, etc.)
      // — do not swallow it; let it propagate so the form can read e.body.
      return ForwardAuthConfigResponse.parse(await client.patch('/api/auth/forward-auth/config', patch));
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['forward-auth-config'] }),
  });
}
