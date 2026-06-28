import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import { z } from 'zod';
import type { ContentType } from '@/api/schemas';

// The API layer uses the long-form content type names ('light_novel', 'audiobook').
// Mobile uses short forms ('novel', 'audio'). This maps between them.
const ApiContentType = z.enum([
  'manga', 'light_novel', 'comic', 'ebook', 'audiobook',
]);
type ApiContentType = z.infer<typeof ApiContentType>;

function apiTypeToMobile(apiType: ApiContentType): ContentType {
  if (apiType === 'light_novel') return 'novel';
  if (apiType === 'audiobook') return 'audio';
  return apiType as ContentType;
}

export type BrowseResultItem = {
  contentType: ContentType;
  sourceId: string;
  title: string;
  year: number | null;
  author: string | null;
  isbn: string | null;
  coverUrl: string | null;
  source: string;
  detail: string | null;
  inLib: boolean;
};

export type BrowseRow = {
  id: string;
  label: string;
  meta: string;
  items: BrowseResultItem[];
};

/** Mobile→API content type for the browse query ('novel'→'light_novel', etc.). */
function mobileTypeToApi(t: ContentType): ApiContentType {
  if (t === 'novel') return 'light_novel';
  if (t === 'audio') return 'audiobook';
  return t as ApiContentType;
}

const ApiBrowseResultItem = z.object({
  contentType: ApiContentType,
  sourceId: z.string(),
  title: z.string(),
  year: z.number().int().nullable().optional(),
  author: z.string().nullable().optional(),
  isbn: z.string().nullable().optional(),
  coverUrl: z.string().nullable().optional(),
  source: z.string(),
  detail: z.string().nullable().optional(),
  inLib: z.boolean().optional(),
});

const ApiBrowseRow = z.object({
  // Row ids vary by content type (trending/popular/fresh for manga, but
  // novel-trending, ebook-trending, comic-recent, audio-itunes-top, …) — accept
  // any so non-manga browse rows aren't rejected.
  id: z.string(),
  label: z.string(),
  meta: z.string(),
  items: z.array(ApiBrowseResultItem),
});

const ApiBrowseResponse = z.object({
  rows: z.array(ApiBrowseRow),
});

export type DiscoverBrowseResult = {
  rows: BrowseRow[];
};

export function useDiscoverBrowse(contentType: ContentType = 'manga') {
  const { state, signOut } = useAuth();
  const apiType = mobileTypeToApi(contentType);
  return useQuery({
    enabled: state.status === 'authenticated',
    queryKey: ['discover-browse', apiType],
    queryFn: async (): Promise<DiscoverBrowseResult> => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      const raw = await client.get(`/api/discover/browse?contentType=${apiType}`);
      const parsed = ApiBrowseResponse.parse(raw);
      return {
        rows: parsed.rows.map((row) => ({
          id: row.id,
          label: row.label,
          meta: row.meta,
          items: row.items.map((item) => ({
            contentType: apiTypeToMobile(item.contentType),
            sourceId: item.sourceId,
            title: item.title,
            year: item.year ?? null,
            author: item.author ?? null,
            isbn: item.isbn ?? null,
            coverUrl: item.coverUrl ?? null,
            source: item.source,
            detail: item.detail ?? null,
            inLib: item.inLib ?? false,
          })),
        })),
      };
    },
    staleTime: 5 * 60_000,
  });
}
