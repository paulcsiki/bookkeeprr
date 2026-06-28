import { z } from 'zod';
import {
  BookSeriesSummary, BookSeriesDetailResponse as DetailResponse,
  CreateBookSeriesBody, UpdateBookSeriesBody, AddMemberBody,
} from '@bookkeeprr/types';

export { CreateBookSeriesBody, UpdateBookSeriesBody, AddMemberBody };
export const BookSeriesSummaryResponse = BookSeriesSummary;
export const BookSeriesListResponse = z.object({ bookSeries: z.array(BookSeriesSummary) });
export const BookSeriesDetailResponse = DetailResponse;
export const BookSeriesDeleteResponse = z.object({ ok: z.literal(true) });
export const BookSeriesMemberDeleteResponse = z.object({ ok: z.literal(true) });
export const BookSeriesRefreshResponse = z.object({ ok: z.literal(true) });
