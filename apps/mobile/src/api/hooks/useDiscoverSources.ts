import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { z } from 'zod';

const DiscoverSource = z.object({
  id: z.enum(['anilist', 'mangadex', 'comicvine', 'openlibrary', 'audnex']),
  label: z.string(),
  configured: z.boolean(),
});

const DiscoverSourcesResponse = z.object({
  sources: z.array(DiscoverSource),
});

export type DiscoverSource = z.infer<typeof DiscoverSource>;

export function useDiscoverSources() {
  const { state, signOut } = useAuth();
  return useQuery({
    enabled: state.status === 'authenticated',
    queryKey: ['discover-sources'],
    queryFn: async () => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      const raw = await client.get('/api/discover/sources');
      return DiscoverSourcesResponse.parse(raw);
    },
    staleTime: 5 * 60_000,
  });
}
