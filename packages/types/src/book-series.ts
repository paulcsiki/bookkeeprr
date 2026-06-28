import { z } from 'zod';

// Book series are per-format: ebooks OR audiobooks only.
export const BookSeriesContentType = z.enum(['ebook', 'audiobook']);
export const BookSeriesSource = z.enum(['manual', 'openlibrary', 'itunes', 'audible', 'googlebooks']);

export const BookSeriesSummary = z.object({
  id: z.number().int(),
  name: z.string(),
  contentType: BookSeriesContentType,
  coverUrl: z.string().nullable(),
  totalBooks: z.number().int().nullable(),
  memberCount: z.number().int(),
  source: BookSeriesSource,
});
export type BookSeriesSummary = z.infer<typeof BookSeriesSummary>;

export const BookSeriesEntry = z.object({
  position: z.number().nullable(),
  title: z.string(),
  externalRef: z.string().nullable(),
  coverUrl: z.string().nullable(),
  owned: z.boolean(),
  seriesId: z.number().int().nullable(), // set when owned
});
export type BookSeriesEntry = z.infer<typeof BookSeriesEntry>;

export const BookSeriesDetailResponse = BookSeriesSummary.extend({
  description: z.string().nullable(),
  books: z.array(BookSeriesEntry),
});
export type BookSeriesDetailResponse = z.infer<typeof BookSeriesDetailResponse>;

export const CreateBookSeriesBody = z.object({
  name: z.string().trim().min(1).max(200),
  contentType: BookSeriesContentType,
  description: z.string().nullable().optional(),
  coverUrl: z.string().url().nullable().optional(),
});
export const UpdateBookSeriesBody = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  coverUrl: z.string().url().nullable().optional(),
}).refine((b) => Object.keys(b).length > 0, { message: 'at least one field required' });

export const AddMemberBody = z.object({
  seriesId: z.number().int().positive(),
  position: z.number().nullable().optional(),
});
