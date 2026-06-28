import { z } from 'zod';

// The app uses short content-type names internally, but the API returns the
// web's vocabulary (light_novel / audiobook). Map inbound at parse time so the
// rest of the app keeps using the short forms.
export const ContentType = z.preprocess(
  (v) => (v === 'light_novel' ? 'novel' : v === 'audiobook' ? 'audio' : v),
  z.enum(['manga', 'comic', 'novel', 'ebook', 'audio']),
);
export type ContentType = z.infer<typeof ContentType>;

// Per-series reading progress, surfaced on each list row. Optional/nullable so
// older servers (and fixtures predating these fields) still parse.
export const ReadState = z.enum(['unread', 'reading', 'finished']);
export type ReadState = z.infer<typeof ReadState>;

// Per-series fulfilment health, surfaced on each list row.
export const SeriesHealth = z.enum(['complete', 'missing', 'downloading', 'error']);
export type SeriesHealth = z.infer<typeof SeriesHealth>;

export const SeriesSummary = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  contentType: ContentType,
  coverUrl: z.string().url().nullable(),
  monitored: z.boolean(),
  volumes: z.number().int().nonnegative(),
  downloaded: z.number().int().nonnegative(),
  readState: ReadState.nullable().optional(),
  health: SeriesHealth.nullable().optional(),
  groupId: z.number().int().positive().nullable().catch(null),
  groupPath: z.string().catch(''),
});
export type SeriesSummary = z.infer<typeof SeriesSummary>;

export const Volume = z.object({
  id: z.number().int().positive(),
  number: z.union([z.number(), z.string()]),
  title: z.string().nullable(),
  status: z.enum(['unaired', 'wanted', 'downloading', 'downloaded', 'imported', 'failed']),
  publishedAt: z.string().nullable(),
  // Per-volume cover. May be a root-relative /api/img proxy path (resolve
  // against the server URL before loading). Optional for backward compat with
  // servers that predate per-volume covers.
  coverUrl: z.string().nullable().optional(),
  // First library file backing this volume, when owned. Lets the client open a
  // "Read now" reader for the volume (paged readers key off the file id).
  libraryFileId: z.number().int().positive().nullable().optional(),
  // Per-user read state for this volume. Optional + defaulted for backward compat
  // with servers that predate per-volume read tracking.
  read: z.enum(['unread', 'reading', 'finished']).optional().default('unread'),
});
export type Volume = z.infer<typeof Volume>;

export const SeriesDetail = SeriesSummary.extend({
  description: z.string().nullable(),
  author: z.string().nullable(),
  startYear: z.number().int().nullable(),
  volumesList: z.array(Volume),
  // Optional for back-compat with servers predating this field. True while any
  // background job (metadata/volume hydrate, chapter sync, import) is still
  // running for this series — clients poll until false.
  hydrating: z.boolean().optional().default(false),
});
export type SeriesDetail = z.infer<typeof SeriesDetail>;

export const SeriesListResponse = z.object({
  rows: z.array(SeriesSummary),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
});
export type SeriesListResponse = z.infer<typeof SeriesListResponse>;
