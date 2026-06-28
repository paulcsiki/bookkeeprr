import { z } from 'zod';

export const AniListTitle = z.object({
  english: z.string().nullable().optional(),
  romaji: z.string().nullable().optional(),
  native: z.string().nullable().optional(),
});

export const AniListCoverImage = z.object({
  extraLarge: z.string().url().nullable().optional(),
  large: z.string().url().nullable().optional(),
  medium: z.string().url().nullable().optional(),
});

export const AniListStatusEnum = z.enum([
  'FINISHED',
  'RELEASING',
  'NOT_YET_RELEASED',
  'CANCELLED',
  'HIATUS',
]);

export const AniListSearchEntry = z.object({
  id: z.number().int().positive(),
  title: AniListTitle,
  coverImage: AniListCoverImage.optional(),
  status: AniListStatusEnum.nullable().optional(),
  format: z.string().nullable().optional(),
  startDate: z.object({ year: z.number().int().nullable().optional() }).nullable().optional(),
});

export type AniListSearchEntryT = z.infer<typeof AniListSearchEntry>;

export const AniListMangaDetail = AniListSearchEntry.extend({
  description: z.string().nullable().optional(),
  volumes: z.number().int().nullable().optional(),
  chapters: z.number().int().nullable().optional(),
});

export type AniListMangaDetailT = z.infer<typeof AniListMangaDetail>;

export const AniListSearchResponse = z.object({
  data: z.object({
    Page: z.object({
      media: z.array(AniListSearchEntry),
    }),
  }),
});

export const AniListMangaResponse = z.object({
  data: z.object({
    Media: AniListMangaDetail,
  }),
});

export const AniListStaffName = z.object({
  full: z.string().nullable().optional(),
  native: z.string().nullable().optional(),
});

export const AniListStaffEdge = z.object({
  role: z.string().nullable().optional(),
  node: z.object({ name: AniListStaffName }).nullable().optional(),
});

export const AniListStaffConnection = z.object({
  edges: z.array(AniListStaffEdge).nullable().optional(),
});

export const AniListNovelSearchEntry = AniListSearchEntry.extend({
  coverImage: AniListCoverImage.nullable().optional(),
  volumes: z.number().int().nullable().optional(),
  chapters: z.number().int().nullable().optional(),
  staff: AniListStaffConnection.nullable().optional(),
});

export type AniListNovelSearchEntryT = z.infer<typeof AniListNovelSearchEntry>;

export const AniListNovelSearchResponse = z.object({
  data: z.object({
    Page: z.object({
      media: z.array(AniListNovelSearchEntry),
    }),
  }),
});

export const AniListNovelDetail = AniListMangaDetail.extend({
  staff: AniListStaffConnection.nullable().optional(),
});

export type AniListNovelDetailT = z.infer<typeof AniListNovelDetail>;

export const AniListNovelResponse = z.object({
  data: z.object({
    Media: AniListNovelDetail,
  }),
});

// Domain-mapped types (what the rest of the app consumes)
export type SearchHit = {
  anilistId: number;
  titleEnglish: string | null;
  titleRomaji: string | null;
  titleNative: string | null;
  coverUrl: string | null;
  status: 'releasing' | 'finished' | 'hiatus' | 'cancelled';
  format: string | null;
  startYear: number | null;
  author?: string | null;
};

export type MangaDetail = SearchHit & {
  description: string | null;
  totalVolumes: number | null;
  totalChapters: number | null;
};

export function mapStatus(raw: AniListSearchEntryT['status']): SearchHit['status'] {
  switch (raw) {
    case 'RELEASING':
      return 'releasing';
    case 'FINISHED':
      return 'finished';
    case 'HIATUS':
      return 'hiatus';
    case 'CANCELLED':
      return 'cancelled';
    case 'NOT_YET_RELEASED':
      return 'releasing';
    case null:
    case undefined:
      return 'releasing';
  }
}

export function mapSearchEntry(raw: AniListSearchEntryT): SearchHit {
  return {
    anilistId: raw.id,
    titleEnglish: raw.title.english ?? null,
    titleRomaji: raw.title.romaji ?? null,
    titleNative: raw.title.native ?? null,
    coverUrl: raw.coverImage?.extraLarge ?? raw.coverImage?.large ?? raw.coverImage?.medium ?? null,
    status: mapStatus(raw.status),
    format: raw.format ?? null,
    startYear: raw.startDate?.year ?? null,
  };
}

export function mapMangaDetail(raw: AniListMangaDetailT): MangaDetail {
  return {
    ...mapSearchEntry(raw),
    description: raw.description ?? null,
    totalVolumes: raw.volumes ?? null,
    totalChapters: raw.chapters ?? null,
  };
}

export function extractAuthorFromStaff(
  staff: z.infer<typeof AniListStaffConnection> | null | undefined,
): string | null {
  const edges = staff?.edges ?? [];
  for (const edge of edges) {
    if (typeof edge?.role === 'string' && /Story/i.test(edge.role)) {
      return edge.node?.name?.full ?? edge.node?.name?.native ?? null;
    }
  }
  return null;
}

export function mapNovelSearchEntry(raw: AniListNovelSearchEntryT): SearchHit {
  const base: AniListSearchEntryT = { ...raw, coverImage: raw.coverImage ?? undefined };
  return {
    ...mapSearchEntry(base),
    author: extractAuthorFromStaff(raw.staff),
  };
}

export function mapNovelDetail(raw: AniListNovelDetailT): MangaDetail {
  return {
    ...mapMangaDetail(raw),
    author: extractAuthorFromStaff(raw.staff),
  };
}
