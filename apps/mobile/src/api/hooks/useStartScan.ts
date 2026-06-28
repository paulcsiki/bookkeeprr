import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient, ApiError } from '@/api/client';
import { ScanStartResponse } from '@/api/schemas/library';

export type StartScanResult = ScanStartResponse | { alreadyRunning: true };

export function useStartScan() {
  const { state, signOut } = useAuth();
  return useMutation({
    mutationFn: async (body: { rootPath: string }): Promise<StartScanResult> => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      try {
        const res = await client.post<unknown>('/api/scan', body);
        return ScanStartResponse.parse(res);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          return { alreadyRunning: true };
        }
        throw err;
      }
    },
  });
}
