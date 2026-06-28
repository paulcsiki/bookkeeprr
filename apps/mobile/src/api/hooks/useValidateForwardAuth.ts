import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { ForwardAuthValidateResult } from '@/api/schemas';

export function useValidateForwardAuth() {
  const { state, signOut } = useAuth();
  return useMutation({
    mutationFn: async (vars: { trustedProxies: string[]; userHeader: string }) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      return ForwardAuthValidateResult.parse(await client.post('/api/auth/forward-auth/validate', vars));
    },
  });
}
