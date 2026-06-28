import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { OidcConfigResponse, type OidcConfig } from '@/api/schemas';

export function useUpdateOidcConfig() {
  const { state, signOut } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<OidcConfig>) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      return OidcConfigResponse.parse(await client.patch('/api/auth/oidc/config', patch));
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['oidc-config'] }),
  });
}
