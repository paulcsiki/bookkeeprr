import { z } from 'zod';

export const NuSearchHitSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  coverUrl: z.string().nullable(),
  year: z.number().int().nullable(),
});

export type NuSearchHit = z.infer<typeof NuSearchHitSchema>;

export const NuSeriesDetailSchema = z.object({
  slug: z.string(),
  numericId: z.number().int().positive().nullable(),
  title: z.string().min(1),
  aliases: z.array(z.string()),
  coverUrl: z.string().nullable(),
  description: z.string().nullable(),
  author: z.string().nullable(),
  illustrator: z.string().nullable(),
  originalLanguage: z.string().nullable(),
  totalVolumes: z.number().int().nullable(),
  statusInCoo: z.string().nullable(),
});

export type NuSeriesDetail = z.infer<typeof NuSeriesDetailSchema>;

export const NuChapterEntrySchema = z.object({
  title: z.string().min(1),
  link: z.string().url(),
  pubDate: z.date(),
});

export type NuChapterEntry = z.infer<typeof NuChapterEntrySchema>;
