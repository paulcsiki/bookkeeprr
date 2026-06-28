import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient, ApiError } from '@/api/client';
import { ManualGrabResponse } from '@/api/schemas';

/**
 * Map the manual-grab error contract to user-readable copy:
 * 400 invalid magnet · 404 unknown series · 409 duplicate torrent ·
 * 503 qBittorrent not configured.
 */
export function manualGrabErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 400) return "That magnet link doesn't look valid.";
    if (err.status === 404) return "That title isn't in the library anymore.";
    if (err.status === 409) return 'You already grabbed this torrent for this title.';
    if (err.status === 503) return "qBittorrent isn't configured.";
  }
  return "Couldn't send the magnet link — check the server.";
}

/** POST a pasted magnet link; the server queues it like any other grab. */
export function useManualGrab() {
  const { state, signOut } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ seriesId, magnet }: { seriesId: number; magnet: string }) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      const raw = await client.post(`/api/series/${seriesId}/manual-grab`, { magnet });
      return ManualGrabResponse.parse(raw);
    },
    onSuccess: () => {
      // Same invalidation as useGrabRelease, plus the downloads lists — the
      // queued torrent shows up in Activity immediately.
      qc.invalidateQueries({ queryKey: ['activity'] });
      qc.invalidateQueries({ queryKey: ['downloads'] });
    },
  });
}
