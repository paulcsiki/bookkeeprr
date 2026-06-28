import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient, ApiError } from '@/api/client';
import { UpdatesCheckResponse, UpdatesRateLimited } from '@/api/schemas';

export type CheckUpdatesResult =
  | { kind: 'state'; state: UpdatesCheckResponse['state'] }
  | { kind: 'rate-limited'; retryAfterSeconds: number };

export function useCheckUpdates() {
  const { state, signOut } = useAuth();
  const qc = useQueryClient();
  return useMutation<CheckUpdatesResult>({
    mutationFn: async () => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      // The route returns 429 when checked too recently → ApiError; map its body
      // to a "checked recently" result instead of bubbling an error.
      try {
        const res = UpdatesCheckResponse.parse(await client.post('/api/updates/check', {}));
        return { kind: 'state', state: res.state };
      } catch (e) {
        if (e instanceof ApiError && e.status === 429) {
          const r = UpdatesRateLimited.safeParse(e.body);
          return {
            kind: 'rate-limited',
            retryAfterSeconds: r.success ? r.data.retryAfterSeconds : 0,
          };
        }
        throw e;
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['updates-overview'] }),
  });
}
