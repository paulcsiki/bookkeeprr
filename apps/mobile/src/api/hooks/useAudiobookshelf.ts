import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { AudiobookshelfConfig } from '@/api/schemas';

export function useAudiobookshelf() {
  const { state, signOut } = useAuth();
  return useQuery({
    enabled: state.status === 'authenticated',
    queryKey: ['abs'],
    queryFn: async () => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      return AudiobookshelfConfig.parse(
        await client.get('/api/settings/library-sync/audiobookshelf'),
      );
    },
  });
}
