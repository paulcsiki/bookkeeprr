import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { ReaderManifest } from '@/api/schemas';

export interface ReaderManifestParams {
  /** Resolve a manifest for an audio volume (or the volume's primary file). */
  volumeId?: number;
  /** Resolve a manifest for a specific library file (paged formats). */
  fileId?: number;
}

/**
 * Fetch + validate the reader manifest for a readable. The server requires
 * exactly one of `volumeId` / `fileId`; the query stays disabled until one is
 * provided (and the user is authenticated).
 */
export function useReaderManifest(params: ReaderManifestParams) {
  const { state, signOut } = useAuth();
  const hasTarget = params.volumeId !== undefined || params.fileId !== undefined;
  return useQuery({
    enabled: state.status === 'authenticated' && hasTarget,
    queryKey: ['reader-manifest', params],
    queryFn: async () => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      const qs = new URLSearchParams(
        params.volumeId !== undefined
          ? { volumeId: String(params.volumeId) }
          : { fileId: String(params.fileId) },
      );
      const raw = await client.get(`/api/reader/manifest?${qs.toString()}`);
      return ReaderManifest.parse(raw);
    },
  });
}
