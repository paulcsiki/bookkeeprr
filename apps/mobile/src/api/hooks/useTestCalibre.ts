import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient, ApiError } from '@/api/client';
import { SyncTestResult } from '@/api/schemas';

export function useTestCalibre() {
  const { state, signOut } = useAuth();
  return useMutation({
    mutationFn: async () => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      // Route returns 502 on failure → ApiError; resolve instead of rejecting
      try {
        return SyncTestResult.parse(
          await client.post('/api/settings/library-sync/calibre/test', {}),
        );
      } catch (e) {
        if (e instanceof ApiError) {
          const r = SyncTestResult.safeParse(e.body);
          if (r.success) return r.data;
        }
        throw e;
      }
    },
  });
}
