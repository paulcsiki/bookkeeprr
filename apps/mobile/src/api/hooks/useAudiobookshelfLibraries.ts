import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { LibraryListResponse } from '@/api/schemas';

interface UseAudiobookshelfLibrariesOptions {
  enabled?: boolean;
}

export function useAudiobookshelfLibraries(opts: UseAudiobookshelfLibrariesOptions = {}) {
  const { state, signOut } = useAuth();
  return useQuery({
    enabled: state.status === 'authenticated' && (opts.enabled ?? false),
    queryKey: ['abs-libraries'],
    queryFn: async () => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      return LibraryListResponse.parse(
        await client.get('/api/settings/library-sync/audiobookshelf/libraries'),
      );
    },
  });
}
