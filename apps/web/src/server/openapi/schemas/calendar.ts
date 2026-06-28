import { z } from 'zod';
import { ContentTypeEnum, MonitoringEnum } from './series';

// ─────────────────────────────────────────────────────────────────────────────
// Calendar family — the release-calendar feed. The query schema is the single
// source of truth, used BOTH for runtime validation in the route handler
// (app/api/calendar/route.ts) and for the generated OpenAPI spec.
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/calendar query — a [from, to) date window, `to` exclusive. */
export const CalendarQuery = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD')
    .describe('Window start (inclusive), YYYY-MM-DD, interpreted as UTC midnight.'),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD')
    .describe('Window end (EXCLUSIVE), YYYY-MM-DD. Must be after `from`.'),
});

// ─────────────────────────────────────────────────────────────────────────────
// Response schemas — authored from the handler's actual NextResponse.json
// payload (listCalendarEntries in src/server/db/calendar.ts).
// ─────────────────────────────────────────────────────────────────────────────

/** One calendar entry: a volume with a known release date inside the window. */
export const CalendarEntry = z.object({
  date: z.string().describe('Release date, YYYY-MM-DD (UTC).'),
  volumeId: z.number().int(),
  volumeNumber: z.number(),
  volumeTitle: z.string().nullable(),
  seriesId: z.number().int(),
  seriesTitle: z
    .string()
    .describe('First non-null of english/romaji/native; falls back to `Series #<id>`.'),
  contentType: ContentTypeEnum,
  coverUrl: z.string().nullable().describe('Series cover (not per-volume).'),
  author: z.string().nullable(),
  publisher: z.string().nullable(),
  monitoring: MonitoringEnum,
});

/** GET /api/calendar 200 — entries sorted by date, then series title, then
 *  volume number. */
export const CalendarResponse = z.object({
  entries: z.array(CalendarEntry),
});
