import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { CloudSettingsResponse } from '@/api/schemas';

interface ConnectArgs {
  acceptedEulaVersion: string;
  acceptedPrivacyVersion: string;
}

export function useCloudConnect() {
  const { state, signOut } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: ConnectArgs) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      return CloudSettingsResponse.parse(await client.post('/api/settings/cloud/connect', args));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cloud-settings'] }),
  });
}
