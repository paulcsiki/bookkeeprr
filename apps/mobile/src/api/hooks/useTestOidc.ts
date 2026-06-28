import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient, ApiError } from '@/api/client';
import { OidcTestResult } from '@/api/schemas';

export function useTestOidc() {
  const { state, signOut } = useAuth();
  return useMutation({
    mutationFn: async (vars: { issuer: string; clientId: string; clientSecret: string }) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      // The route returns 502 on discovery failure → ApiError; map to a parsed result.
      try {
        return OidcTestResult.parse(await client.post('/api/auth/oidc/test', vars));
      } catch (e) {
        if (e instanceof ApiError) {
          const r = OidcTestResult.safeParse(e.body);
          if (r.success) return r.data;
        }
        throw e;
      }
    },
  });
}
