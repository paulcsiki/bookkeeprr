import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient, ApiError } from '@/api/client';
import { ApiKeyTestResult } from '@/api/schemas';

export function useTestApiKey() {
  const { state, signOut } = useAuth();
  return useMutation({
    mutationFn: async () => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      // The route returns 401 on auth failure → ApiError; map to a parsed result.
      try {
        return ApiKeyTestResult.parse(await client.post('/api/settings/api-key/test', {}));
      } catch (e) {
        if (e instanceof ApiError) {
          const r = ApiKeyTestResult.safeParse(e.body);
          if (r.success) return r.data;
        }
        throw e;
      }
    },
  });
}
