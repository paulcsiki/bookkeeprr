import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { SeriesListResponse } from '@/api/schemas';

export interface LibraryParams {
  page: number;
  limit: number;
  sort?: 'added_at:desc' | 'added_at:asc' | 'title:asc';
  q?: string | undefined;
}

export function useLibrary(params: LibraryParams) {
  const { state, signOut } = useAuth();
  return useQuery({
    enabled: state.status === 'authenticated',
    // Keep the previous page's rows while a new query (e.g. each search
    // keystroke changes `q`) is in flight. Without this, `isLoading` flips true
    // on every key change, the Library screen falls back to its skeleton, the
    // search TextInput unmounts, and its `autoFocus` reopens the keyboard —
    // making it flicker open/closed on every character typed.
    placeholderData: keepPreviousData,
    queryKey: ['library', params],
    queryFn: async () => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      const qs = new URLSearchParams({
        page: String(params.page),
        limit: String(params.limit),
        ...(params.sort ? { sort: params.sort } : {}),
        ...(params.q ? { q: params.q } : {}),
      });
      const raw = await client.get(`/api/series?${qs.toString()}`);
      return SeriesListResponse.parse(raw);
    },
  });
}
