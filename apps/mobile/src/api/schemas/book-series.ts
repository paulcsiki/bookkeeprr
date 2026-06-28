// Re-export and wrap the canonical book-series schemas from @bookkeeprr/types.
// The shared package ships the zod schemas; this file re-exports them for
// mobile consumers and adds the list-response wrapper used by GET /api/book-series.
import { z } from 'zod';
import {
  BookSeriesContentType,
  BookSeriesSource,
  BookSeriesSummary,
  BookSeriesEntry,
  BookSeriesDetailResponse,
} from '@bookkeeprr/types';

export {
  BookSeriesContentType,
  BookSeriesSource,
  BookSeriesSummary,
  BookSeriesEntry,
  BookSeriesDetailResponse,
};
export type { BookSeriesSummary as BookSeriesSummaryType } from '@bookkeeprr/types';
export type { BookSeriesDetailResponse as BookSeriesDetailResponseType } from '@bookkeeprr/types';

// Inferred string-union types for use in function signatures.
export type BookSeriesContentTypeValue = z.infer<typeof BookSeriesContentType>;
export type BookSeriesSourceValue = z.infer<typeof BookSeriesSource>;

export const BookSeriesListResponse = z.object({
  bookSeries: z.array(BookSeriesSummary),
});
export type BookSeriesListResponse = z.infer<typeof BookSeriesListResponse>;
