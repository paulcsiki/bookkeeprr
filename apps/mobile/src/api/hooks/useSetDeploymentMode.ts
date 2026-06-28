import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';

export type DeploymentMode = 'auto' | 'docker' | 'kubernetes';

export function useSetDeploymentMode() {
  const { state, signOut } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (mode: DeploymentMode) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      return (await client.patch('/api/settings/deployment-mode', { mode })) as { mode: string };
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['updates-overview'] }),
  });
}
