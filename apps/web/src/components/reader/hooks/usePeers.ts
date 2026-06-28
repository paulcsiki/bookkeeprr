'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import type { PeersResponse } from '@/app/api/reader/progress/[readableKey]/peers/route';

const REFETCH_INTERVAL_MS = 30_000; // poll every 30 s

/**
 * Fetches peer-device progress for the given readable from the server.
 *
 * Polls every 30 seconds so the HandoffCard appears without a page reload.
 * Returns an empty array while loading or when no peers are ahead.
 */
export function usePeers(
  readableKey: string,
  selfDeviceId: string,
): {
  peers: PeersResponse['peers'];
  isLoading: boolean;
} {
  // Don't fetch if we don't have a device ID yet (SSR / localStorage blocked).
  const enabled = selfDeviceId !== '';

  const { data, isLoading } = useQuery<PeersResponse>({
    queryKey: ['reader-peers', readableKey, selfDeviceId],
    queryFn: async () => {
      const url = `/api/reader/progress/${encodeURIComponent(readableKey)}/peers?selfDeviceId=${encodeURIComponent(selfDeviceId)}`;
      const res = await apiFetch(url);
      if (!res.ok) throw new Error(`peers fetch failed: HTTP ${res.status}`);
      return res.json() as Promise<PeersResponse>;
    },
    enabled,
    refetchInterval: REFETCH_INTERVAL_MS,
    staleTime: REFETCH_INTERVAL_MS / 2,
  });

  return {
    peers: data?.peers ?? [],
    isLoading: enabled && isLoading,
  };
}
