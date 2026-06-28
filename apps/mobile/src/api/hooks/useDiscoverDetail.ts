import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient } from '@/api/client';
import type { ContentType } from '@/api/schemas';
import type { DiscoverResultItem } from './useDiscoverSearch';

// Mobile short forms → API long forms, mirroring useDiscoverSearch.
function mobileTypeToApi(t: ContentType): string {
  if (t === 'novel') return 'light_novel';
  if (t === 'audio') return 'audiobook';
  return t;
}

/** Zod schema for the /api/discover/detail response — mirrors web DiscoverDetail type. */
export const DiscoverDetailSchema = z.object({
  description: z.string().nullable().optional(),
  totalVolumes: z.number().int().nullable().optional(),
  totalChapters: z.number().int().nullable().optional(),
  mangadexId: z.string().nullable().optional(),
});

export type DiscoverDetail = z.infer<typeof DiscoverDetailSchema>;

/**
 * Fetches extended detail (synopsis, volume/chapter counts) for a discover
 * result from GET /api/discover/detail. Mirrors the web DiscoverDetailDialog
 * query with the same params and 5-min staleTime. Returns {} on fetch error
 * (best-effort; never breaks the sheet).
 */
export function useDiscoverDetail(result: DiscoverResultItem | null, enabled: boolean) {
  const { state, signOut } = useAuth();
  return useQuery<DiscoverDetail>({
    enabled: enabled && result != null && state.status === 'authenticated',
    queryKey: [
      'discover-detail',
      result?.contentType,
      result?.source,
      result?.sourceId,
      result?.title,
      result?.sources?.mangadex,
    ],
    queryFn: async (): Promise<DiscoverDetail> => {
      if (result == null || state.status !== 'authenticated') return {};
      const client = createApiClient(state.creds, { onAuthFail: () => signOut() });
      const qs = new URLSearchParams({
        contentType: mobileTypeToApi(result.contentType),
        source: result.source,
        id: result.sourceId,
      });
      // Title lets the endpoint lazily resolve a MangaDex match for browse tiles
      // that carry no pre-resolved cross-link (mirrors web dialog behaviour).
      if (result.title) qs.set('title', result.title);
      // Cross-linked MangaDex id powers the chapter-count fallback.
      if (result.sources?.mangadex) qs.set('mdexId', result.sources.mangadex);
      try {
        const raw = await client.get(`/api/discover/detail?${qs.toString()}`);
        return DiscoverDetailSchema.parse(raw);
      } catch {
        // Best-effort: never break the sheet on a failed detail fetch.
        return {};
      }
    },
    staleTime: 5 * 60_000,
  });
}
