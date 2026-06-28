import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient, ApiError } from '@/api/client';
import { NotificationsTestResult } from '@/api/schemas';

export function useTestNotifications() {
  const { state, signOut } = useAuth();
  return useMutation({
    mutationFn: async () => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      // Route always returns 200 with { discord, apprise } results
      try {
        return NotificationsTestResult.parse(
          await client.post('/api/settings/notifications/test', {}),
        );
      } catch (e) {
        if (e instanceof ApiError) {
          const r = NotificationsTestResult.safeParse(e.body);
          if (r.success) return r.data;
        }
        throw e;
      }
    },
  });
}
