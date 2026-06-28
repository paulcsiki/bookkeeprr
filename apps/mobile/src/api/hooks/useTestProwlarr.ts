import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient, ApiError } from '@/api/client';
import { ProwlarrTestResult } from '@/api/schemas';

interface TestProwlarrVars {
  // Both optional: blank fields fall back to the stored Prowlarr connection.
  url?: string;
  apiKey?: string;
}

export function useTestProwlarr() {
  const { state, signOut } = useAuth();
  return useMutation({
    mutationFn: async (vars: TestProwlarrVars) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      // On success the route returns { ok: true }. On a connection failure it
      // returns { error } with a 5xx → ApiError; surface that as { ok: false }
      // so the card can render a failure result without throwing (like useTestQbt).
      try {
        return ProwlarrTestResult.parse(await client.post('/api/indexers/prowlarr/test', vars));
      } catch (e) {
        if (e instanceof ApiError) return { ok: false };
        throw e;
      }
    },
  });
}
