import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';

const REFETCH_INTERVAL_MS = 30_000;

const PeerItem = z.object({
  deviceId: z.string(),
  deviceName: z.string().nullable(),
  position: z.number(),
  updatedAt: z.string(),
});

const PeersResponse = z.object({
  peers: z.array(PeerItem),
});

export type PeerItem = z.infer<typeof PeerItem>;

/**
 * Fetches peer-device progress for the given readable, excluding the calling
 * device (selfDeviceId). Polls every 30 s. Returns an empty array when the
 * device ID is not yet resolved or the readable key is empty.
 */
export function usePeers(
  readableKey: string,
  selfDeviceId: string,
): { peers: PeerItem[]; isLoading: boolean } {
  const { state, signOut } = useAuth();
  const enabled =
    state.status === 'authenticated' && readableKey !== '' && selfDeviceId !== '';

  const { data, isLoading } = useQuery({
    enabled,
    queryKey: ['reader-peers', readableKey, selfDeviceId],
    queryFn: async () => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      const path = `/api/reader/progress/${encodeURIComponent(readableKey)}/peers?selfDeviceId=${encodeURIComponent(selfDeviceId)}`;
      const raw = await client.get(path);
      return PeersResponse.parse(raw);
    },
    refetchInterval: REFETCH_INTERVAL_MS,
    staleTime: REFETCH_INTERVAL_MS / 2,
  });

  return {
    peers: data?.peers ?? [],
    isLoading: enabled && isLoading,
  };
}
