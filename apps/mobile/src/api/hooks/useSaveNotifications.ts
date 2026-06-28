import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import type { NotificationsPatchBody } from '@/api/schemas';

export function useSaveNotifications() {
  const { state, signOut } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: NotificationsPatchBody) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      await client.patch('/api/settings/notifications', body);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
