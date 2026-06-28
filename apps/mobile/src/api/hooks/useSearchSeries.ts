import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { SearchResponse, type ContentType } from '@/api/schemas';

interface Params {
  query: string;
  contentType: ContentType | 'all';
}

export function useSearchSeries({ query, contentType }: Params) {
  const { state, signOut } = useAuth();
  const trimmed = query.trim();
  return useQuery({
    enabled: state.status === 'authenticated' && trimmed.length > 0,
    queryKey: ['search', trimmed, contentType],
    queryFn: async () => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      const qs = new URLSearchParams({ q: trimmed });
      if (contentType !== 'all') qs.set('contentType', contentType);
      const raw = await client.get(`/api/mobile/search?${qs.toString()}`);
      return SearchResponse.parse(raw);
    },
    staleTime: 30_000,
  });
}
