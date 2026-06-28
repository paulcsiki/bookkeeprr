import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient, ApiError } from '@/api/client';
import { KeyTestResult } from '@/api/schemas';

interface TestFlaresolverrVars {
  url?: string;
}

export function useTestFlaresolverr() {
  const { state, signOut } = useAuth();
  return useMutation({
    mutationFn: async (vars: TestFlaresolverrVars) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      // The route returns 502 on connection failure → ApiError; map to a parsed result.
      try {
        return KeyTestResult.parse(await client.post('/api/settings/flaresolverr/test', vars));
      } catch (e) {
        if (e instanceof ApiError) {
          const r = KeyTestResult.safeParse(e.body);
          if (r.success) return r.data;
        }
        throw e;
      }
    },
  });
}
