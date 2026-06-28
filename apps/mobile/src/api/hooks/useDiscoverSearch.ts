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

// Cross-linked provider ids for a discover result — mirrors the web DiscoverResult sources shape.
export type DiscoverResultSources = {
  anilist?: number | null;
  mal?: number | null;
  mangadex?: string | null;
  comicvine?: number | null;
  openlibrary?: string | null;
  audnex?: string | null;
};

export type DiscoverResultItem = {
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
  /** Cross-linked provider ids (optional — not all sources populate this). */
  sources?: DiscoverResultSources | null;
  /** MyAnimeList id, when present as a top-level field from the API. */
  malId?: number | null;
};

const ApiDiscoverResultSources = z.object({
  anilist: z.number().int().nullable().optional(),
  mal: z.number().int().nullable().optional(),
  mangadex: z.string().nullable().optional(),
  comicvine: z.number().int().nullable().optional(),
  openlibrary: z.string().nullable().optional(),
  audnex: z.string().nullable().optional(),
}).optional().nullable();

const ApiDiscoverResult = z.object({
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
  sources: ApiDiscoverResultSources,
  malId: z.number().int().nullable().optional(),
});

const ApiDiscoverSearchResponse = z.object({
  results: z.array(ApiDiscoverResult),
  tookMs: z.number(),
  errors: z.record(z.string(), z.string()).optional(),
});

export type DiscoverSearchResult = {
  results: DiscoverResultItem[];
  tookMs: number;
  errors?: Record<string, string>;
};

interface Params {
  query: string;
  contentType: ContentType | 'all';
  enabled?: boolean;
}

export function useDiscoverSearch({ query, contentType, enabled = true }: Params) {
  const { state, signOut } = useAuth();
  const trimmed = query.trim();
  return useQuery({
    enabled: enabled && state.status === 'authenticated' && trimmed.length > 0,
    queryKey: ['discover-search', trimmed, contentType],
    queryFn: async (): Promise<DiscoverSearchResult> => {
      if (state.status !== 'authenticated') throw new Error('unauthenticated');
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      const qs = new URLSearchParams({ q: trimmed });
      // Map mobile short form back to API long form
      if (contentType !== 'all') {
        const apiType = contentType === 'novel' ? 'light_novel'
          : contentType === 'audio' ? 'audiobook'
          : contentType;
        qs.set('contentType', apiType);
      }
      const raw = await client.get(`/api/discover/search?${qs.toString()}`);
      const parsed = ApiDiscoverSearchResponse.parse(raw);
      return {
        results: parsed.results.map((r) => ({
          contentType: apiTypeToMobile(r.contentType),
          sourceId: r.sourceId,
          title: r.title,
          year: r.year ?? null,
          author: r.author ?? null,
          isbn: r.isbn ?? null,
          coverUrl: r.coverUrl ?? null,
          source: r.source,
          detail: r.detail ?? null,
          inLib: r.inLib ?? false,
          sources: r.sources ?? null,
          malId: r.malId ?? null,
        })),
        tookMs: parsed.tookMs,
        ...(parsed.errors !== undefined ? { errors: parsed.errors } : {}),
      } as DiscoverSearchResult;
    },
    staleTime: 30_000,
  });
}
