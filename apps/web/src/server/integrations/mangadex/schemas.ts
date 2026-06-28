import { z } from 'zod';

export const MdAttributes = z.object({
  title: z.record(z.string(), z.string()).optional(),
  altTitles: z.array(z.record(z.string(), z.string())).optional(),
  status: z.string().nullable().optional(),
  year: z.number().int().nullable().optional(),
  lastVolume: z.string().nullable().optional(),
  lastChapter: z.string().nullable().optional(),
});

export const MdRelationship = z.object({
  id: z.string(),
  type: z.string(),
  attributes: z
    .object({
      anilist: z.union([z.string(), z.number()]).optional(),
    })
    .partial()
    .optional(),
});

export const MdManga = z.object({
  id: z.string().uuid(),
  type: z.literal('manga'),
  attributes: MdAttributes,
  relationships: z.array(MdRelationship).optional(),
});

export const MdSearchResponse = z.object({
  result: z.string(),
  data: z.array(MdManga),
  total: z.number().int().optional(),
});

export const MdChapter = z.object({
  id: z.string().uuid(),
  type: z.literal('chapter'),
  attributes: z.object({
    chapter: z.string().nullable().optional(),
    volume: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    publishAt: z.string().datetime({ offset: true }).nullable().optional(),
    translatedLanguage: z.string().nullable().optional(),
  }),
});

export const MdChapterListResponse = z.object({
  result: z.string(),
  data: z.array(MdChapter),
  total: z.number().int(),
  offset: z.number().int(),
  limit: z.number().int(),
});

export const MdCover = z.object({
  id: z.string().uuid(),
  type: z.literal('cover_art'),
  attributes: z.object({
    volume: z.string().nullable().optional(),
    // Real MangaDex covers under re-upload can lack a filename; tolerate null
    // here and skip such covers in getVolumeCovers rather than throwing.
    fileName: z.string().nullable().optional(),
  }),
});

export const MdCoverListResponse = z.object({
  result: z.string(),
  data: z.array(MdCover),
  total: z.number().int().optional(),
  offset: z.number().int().optional(),
  limit: z.number().int().optional(),
});

// Domain types
export type MangaDexManga = {
  mangadexId: string;
  titleEnglish: string | null;
  titleJa: string | null;
  status: string | null;
  year: number | null;
};

export type ChapterEntry = {
  mangadexChapterId: string;
  numberText: string | null;
  numberSort: number | null;
  volume: number | null;
  title: string | null;
  publishAt: Date | null;
  language: string | null;
};

export function mapManga(raw: z.infer<typeof MdManga>): MangaDexManga {
  const a = raw.attributes;
  return {
    mangadexId: raw.id,
    titleEnglish: a.title?.en ?? null,
    titleJa: a.title?.ja ?? a.title?.['ja-ro'] ?? null,
    status: a.status ?? null,
    year: a.year ?? null,
  };
}

export function mapChapter(raw: z.infer<typeof MdChapter>): ChapterEntry {
  const a = raw.attributes;
  const numberText = a.chapter ?? null;
  const parsed = numberText ? parseFloat(numberText) : NaN;
  return {
    mangadexChapterId: raw.id,
    numberText,
    numberSort: Number.isFinite(parsed) ? parsed : null,
    volume: a.volume ? Number(a.volume) : null,
    title: a.title ?? null,
    publishAt: a.publishAt ? new Date(a.publishAt) : null,
    language: a.translatedLanguage ?? null,
  };
}
