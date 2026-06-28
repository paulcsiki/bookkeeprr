import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';

export function useResetUserPassword() {
  const { state, signOut } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: number; newPassword: string; mustChangePassword: boolean }) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      await client.post(`/api/users/${vars.id}/reset-password`, {
        newPassword: vars.newPassword,
        mustChangePassword: vars.mustChangePassword,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
}
