import { z } from 'zod';
import { ContentType } from './series';

// Mirrors GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD (to exclusive) —
// apps/web/src/server/db/calendar.ts `CalendarEntry`. The server speaks the
// web vocabulary (light_novel / audiobook); the shared `ContentType`
// preprocess maps that onto the mobile short forms at parse time.
export const CalendarEntry = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  volumeId: z.number().int(),
  volumeNumber: z.number(),
  volumeTitle: z.string().nullable(),
  seriesId: z.number().int(),
  seriesTitle: z.string(),
  contentType: ContentType,
  coverUrl: z.string().nullable(),
  author: z.string().nullable(),
  publisher: z.string().nullable(),
  monitoring: z.enum(['none', 'all', 'future', 'missing']),
});
export type CalendarEntry = z.infer<typeof CalendarEntry>;

export const CalendarResponse = z.object({
  entries: z.array(CalendarEntry),
});
export type CalendarResponse = z.infer<typeof CalendarResponse>;
