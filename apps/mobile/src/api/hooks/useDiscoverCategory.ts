import { useInfiniteQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import type { ContentType } from '@/api/schemas';

// Mirror of useDiscoverBrowse's content-type mapping (mobile → API long-form).
const ApiContentType = z.enum(['manga', 'light_novel', 'comic', 'ebook', 'audiobook']);
type ApiContentType = z.infer<typeof ApiContentType>;
function mobileTypeToApi(t: ContentType): ApiContentType {
  if (t === 'novel') return 'light_novel';
  if (t === 'audio') return 'audiobook';
  return t as ApiContentType;
}
function apiTypeToMobile(t: ApiContentType): ContentType {
  if (t === 'light_novel') return 'novel';
  if (t === 'audiobook') return 'audio';
  return t as ContentType;
}

export type CategoryItem = {
  contentType: ContentType;
  sourceId: string;
  title: string;
  year: number | null;
  author: string | null;
  isbn: string | null;
  coverUrl: string | null;
  detail: string | null;
  inLib: boolean;
  /** API source identifier (e.g. 'anilist', 'mal', 'mangadex'). */
  source: string;
};

const ApiItem = z.object({
  contentType: ApiContentType,
  sourceId: z.string(),
  title: z.string(),
  year: z.number().int().nullable().optional(),
  author: z.string().nullable().optional(),
  isbn: z.string().nullable().optional(),
  coverUrl: z.string().nullable().optional(),
  detail: z.string().nullable().optional(),
  inLib: z.boolean().optional(),
  source: z.string().optional(),
});
const ApiResponse = z.object({ items: z.array(ApiItem), hasMore: z.boolean() });

/**
 * Paginated "See all" for one Discover browse row (`/api/discover/category`).
 * 1-based pages; advances while the server reports `hasMore`.
 */
export function useDiscoverCategory(
  contentType: ContentType,
  rowId: string,
  enabled: boolean,
) {
  const { state, signOut } = useAuth();
  const apiType = mobileTypeToApi(contentType);
  return useInfiniteQuery({
    enabled: enabled && state.status === 'authenticated',
    queryKey: ['discover-category', apiType, rowId],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      const raw = await client.get(
        `/api/discover/category?contentType=${apiType}&row=${encodeURIComponent(rowId)}&page=${pageParam as number}`,
      );
      const parsed = ApiResponse.parse(raw);
      const items: CategoryItem[] = parsed.items.map((it) => ({
        contentType: apiTypeToMobile(it.contentType),
        sourceId: it.sourceId,
        title: it.title,
        year: it.year ?? null,
        author: it.author ?? null,
        isbn: it.isbn ?? null,
        coverUrl: it.coverUrl ?? null,
        detail: it.detail ?? null,
        inLib: it.inLib ?? false,
        source: it.source ?? '',
      }));
      return { items, hasMore: parsed.hasMore };
    },
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length + 1 : undefined),
    staleTime: 5 * 60_000,
  });
}
