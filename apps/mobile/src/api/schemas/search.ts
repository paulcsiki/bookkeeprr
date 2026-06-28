import { z } from 'zod';
import { ContentType } from './series';

export const SearchResult = z.object({
  sourceId: z.string(),
  contentType: ContentType,
  title: z.string(),
  author: z.string().nullable(),
  year: z.number().int().nullable(),
  coverUrl: z.string().url().nullable(),
  summary: z.string().nullable(),
  inLibrary: z.boolean(),
});
export type SearchResult = z.infer<typeof SearchResult>;

export const SearchResponse = z.object({
  query: z.string(),
  contentType: ContentType,
  tookMs: z.number().int().nonnegative(),
  results: z.array(SearchResult),
});
export type SearchResponse = z.infer<typeof SearchResponse>;

export const AddSeriesRequest = z.object({
  sourceId: z.string(),
  contentType: ContentType,
  qualityProfileId: z.number().int().positive(),
});
export type AddSeriesRequest = z.infer<typeof AddSeriesRequest>;
