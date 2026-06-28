import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Request schemas — single source of truth, used BOTH for runtime validation in
// the route handlers (app/api/series/**) and for the generated OpenAPI spec.
// ─────────────────────────────────────────────────────────────────────────────

export const StatusEnum = z.enum(['releasing', 'finished', 'hiatus', 'cancelled']);
export const MonitoringEnum = z.enum(['none', 'all', 'future', 'missing']);
export const GranularityEnum = z.enum(['volume', 'chapter']);

/**
 * MUST stay in sync with CONTENT_TYPES in `@bookkeeprr/types` — duplicated
 * here because this module is import-pure (zod + relative siblings only).
 * A sync assertion lives in tests/integration/api/series-search-comic.test.ts.
 */
export const ContentTypeEnum = z.enum(['manga', 'comic', 'light_novel', 'ebook', 'audiobook']);

/** Optional library-group assignment shared by every create arm. Unknown ids → 422. */
const GroupIdCreateField = z
  .number()
  .int()
  .positive()
  .optional()
  .describe('Library group to file the new series under. 422 when the group does not exist.');

// Manga branch — covers manga (and other non-comic types with the existing flat schema)
export const MangaBody = z.object({
  contentType: z.literal('manga').optional().default('manga'),
  anilistId: z.number().int().nullable().optional(),
  malId: z.number().int().positive().nullish(),
  mangadexId: z.string().nullish(),
  titleEnglish: z.string().nullish(),
  titleRomaji: z.string().nullish(),
  titleNative: z.string().nullish(),
  status: StatusEnum,
  coverUrl: z.string().nullish(),
  description: z.string().nullish(),
  totalVolumes: z.number().int().nullish(),
  totalChapters: z.number().int().nullish(),
  // Optional: web clients pick a root folder; mobile quick-add omits it and the
  // server derives a default (see deriveDefaultRoot).
  rootPath: z.string().min(1).optional(),
  monitoring: MonitoringEnum.optional(),
  granularity: GranularityEnum.optional(),
  qualityProfileId: z.number().int().positive(),
  extraSearchTermsJson: z.string().optional(),
  groupId: GroupIdCreateField,
});

// Comic branch — requires comicvineId + titleEnglish; status defaults to 'releasing'
export const ComicBody = z.object({
  contentType: z.literal('comic'),
  comicvineId: z.number().int(),
  publisher: z.string().optional(),
  startYear: z.number().int().optional(),
  titleEnglish: z.string(),
  qualityProfileId: z.number().int().positive(),
  status: StatusEnum.optional().default('releasing'),
  rootPath: z.string().min(1).optional(),
  description: z.string().nullish(),
  coverUrl: z.string().nullish(),
  monitoring: MonitoringEnum.optional(),
  groupId: GroupIdCreateField,
});

// Light novel branch — requires titleEnglish + at least one of anilistId /
// novelUpdatesSlug; granularity forced to 'volume'. AniList-anchored novels carry
// an anilistId; NovelUpdates-only novels carry just the slug (Solo Leveling etc.
// that AniList does not catalog as a novel).
export const LightNovelBody = z
  .object({
    contentType: z.literal('light_novel'),
    anilistId: z.number().int().nullable().optional(),
    author: z.string().optional(),
    // Required + non-empty: an NU-only create can't fall back to AniList for the
    // title, so a blank here would persist an untitled series.
    titleEnglish: z.string().min(1),
    titleRomaji: z.string().optional(),
    titleNative: z.string().optional(),
    qualityProfileId: z.number().int().positive(),
    status: StatusEnum.optional().default('releasing'),
    rootPath: z.string().min(1).optional(),
    coverUrl: z.string().optional(),
    description: z.string().optional(),
    totalVolumes: z.number().int().nullable().optional(),
    totalChapters: z.number().int().nullable().optional(),
    monitoring: MonitoringEnum.optional(),
    novelUpdatesSlug: z
      .string()
      .regex(/^[a-z0-9-]+$/, 'novelUpdatesSlug must be a URL slug (lowercase + hyphens)')
      .max(128)
      .optional(),
    groupId: GroupIdCreateField,
  })
  .refine((b) => b.anilistId != null || b.novelUpdatesSlug != null, {
    message: 'light_novel requires anilistId or novelUpdatesSlug',
  });

// Ebook single book — totalVolumes forced to 1
export const EbookSingleBody = z.object({
  contentType: z.literal('ebook'),
  flow: z.literal('single'),
  olid: z.string(),
  isbn: z.string().nullable().optional(),
  author: z.string().nullable().optional(),
  title: z.string(),
  year: z.number().int().nullable().optional(),
  coverUrl: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  qualityProfileId: z.number().int().positive(),
  monitoring: MonitoringEnum.optional(),
  groupId: GroupIdCreateField,
});

// Ebook book series — user-supplied totalVolumes
export const EbookSeriesBody = z.object({
  contentType: z.literal('ebook'),
  flow: z.literal('series'),
  olid: z.string(),
  isbn: z.string().nullable().optional(),
  author: z.string().nullable().optional(),
  title: z.string(),
  year: z.number().int().nullable().optional(),
  coverUrl: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  totalVolumes: z.number().int().min(1).max(200),
  qualityProfileId: z.number().int().positive(),
  monitoring: MonitoringEnum.optional(),
  groupId: GroupIdCreateField,
});

// Audiobook — single-book flow, totalVolumes forced to 1
export const AudiobookBody = z.object({
  contentType: z.literal('audiobook'),
  // Optional: iTunes/NYT/LibriVox audiobooks with no Audible match are added
  // title-keyed (still grabbed via indexers).
  asin: z.string().optional(),
  title: z.string(),
  author: z.string().nullable().optional(),
  narrator: z.string().nullable().optional(),
  coverUrl: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  year: z.number().int().nullable().optional(),
  runtimeMinutes: z.number().int().nullable().optional(),
  qualityProfileId: z.number().int().positive(),
  monitoring: MonitoringEnum.optional(),
  groupId: GroupIdCreateField,
});

export const EbookBody = z.discriminatedUnion('flow', [EbookSingleBody, EbookSeriesBody]);

/** POST /api/series request body — per-content-type branches. */
export const SeriesCreateBody = z.union([
  MangaBody,
  ComicBody,
  LightNovelBody,
  EbookBody,
  AudiobookBody,
]);

/** GET /api/series query string. */
export const SeriesListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['added_at:desc', 'added_at:asc', 'title:asc']).default('added_at:desc'),
  q: z.string().trim().min(1).max(200).optional(),
});

/** PATCH /api/series/{id} request body — strict (unknown fields rejected). */
export const SeriesPatchBody = z
  .object({
    titleEnglish: z.string().nullish(),
    titleRomaji: z.string().nullish(),
    titleNative: z.string().nullish(),
    mangadexId: z.string().nullish(),
    status: StatusEnum.optional(),
    coverUrl: z.string().nullish(),
    description: z.string().nullish(),
    totalVolumes: z.number().int().nullish(),
    totalChapters: z.number().int().nullish(),
    rootPath: z.string().min(1).optional(),
    monitoring: MonitoringEnum.optional(),
    granularity: GranularityEnum.optional(),
    qualityProfileId: z.number().int().positive().optional(),
    extraSearchTermsJson: z.string().optional(),
    groupId: z
      .number()
      .int()
      .positive()
      .nullable()
      .optional()
      .describe(
        'Move the series into a library group (`null` to ungroup). 422 when the group does not exist.',
      ),
  })
  .strict();

/** GET /api/series/search query string. */
export const SeriesSearchQuery = z.object({
  q: z.string().min(1),
  contentType: ContentTypeEnum.optional().default('manga'),
});

/** POST /api/series/search request body (legacy manga-only search). */
export const SeriesSearchBody = z.object({
  query: z.string().trim().min(1),
});

/** POST /api/series/{id}/manual-grab JSON body. (The endpoint alternatively
 *  accepts a multipart form upload with a `torrent` file field.) */
export const ManualGrabBody = z.object({ magnet: z.string().min(1) });

// ─────────────────────────────────────────────────────────────────────────────
// Response schemas — authored from the handlers' actual NextResponse.json
// payloads. Plain z.object (unknown keys stripped) so additive fields are
// tolerated by the test assertions.
// ─────────────────────────────────────────────────────────────────────────────

/** A `series` table row as serialized to JSON (timestamps become ISO strings).
 *  Transcribed from the `series` table in src/server/db/schema.ts. */
export const SeriesRow = z.object({
  id: z.number().int(),
  contentType: ContentTypeEnum,
  anilistId: z.number().int().nullable(),
  malId: z.number().int().nullable(),
  comicvineId: z.number().int().nullable(),
  publisher: z.string().nullable(),
  startYear: z.number().int().nullable(),
  pageCount: z.number().int().nullable(),
  runtimeMinutes: z.number().int().nullable(),
  author: z.string().nullable(),
  openlibraryId: z.string().nullable(),
  isbn: z.string().nullable(),
  asin: z.string().nullable(),
  narrator: z.string().nullable(),
  mangadexId: z.string().nullable(),
  novelUpdatesSlug: z.string().nullable(),
  novelUpdatesId: z.number().int().nullable(),
  googleBooksVolumeId: z.string().nullable(),
  googleBooksQuery: z.string().nullable(),
  titleEnglish: z.string().nullable(),
  titleRomaji: z.string().nullable(),
  titleNative: z.string().nullable(),
  status: StatusEnum,
  coverUrl: z.string().nullable(),
  description: z.string().nullable(),
  totalVolumes: z.number().int().nullable(),
  totalChapters: z.number().int().nullable(),
  rootPath: z.string(),
  monitoring: MonitoringEnum,
  granularity: GranularityEnum,
  qualityProfileId: z.number().int(),
  extraSearchTermsJson: z.string(),
  groupId: z.number().int().nullable(),
  addedAt: z.string(),
  updatedAt: z.string(),
});

/** A series row plus its library-group display path — what POST (most arms),
 *  PATCH, and (extended further) the list/detail endpoints emit. */
export const SeriesRowWithGroupPath = SeriesRow.extend({
  groupPath: z
    .string()
    .describe("Display path ('Engineering / Architecture'), '' when ungrouped."),
});

/** Per-user reading state for a series/volume (src/server/db/reading-progress.ts). */
export const ReadStateEnum = z.enum(['unread', 'reading', 'finished']);

/** Download health for a series (src/server/db/series.ts → SeriesHealth). */
export const SeriesHealthEnum = z.enum(['complete', 'missing', 'downloading', 'error']);

/** One row of GET /api/series — the series table columns plus enrichment. */
export const SeriesListRow = SeriesRowWithGroupPath.extend({
  title: z.string(),
  monitored: z.boolean(),
  volumes: z.number().int(),
  downloaded: z.number().int(),
  readState: ReadStateEnum,
  health: SeriesHealthEnum,
});

export const SeriesListResponse = z.object({
  rows: z.array(SeriesListRow),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
});

/** POST /api/series 201 body. Comic/ebook/audiobook/manga branches return the
 *  full series row; the light_novel branch returns just `{ id }` (see
 *  docs/api.md → Quirks). */
export const SeriesCreateResponse = z.union([
  SeriesRowWithGroupPath,
  z.object({ id: z.number().int() }),
]);

/** One entry of GET /api/series/{id} `volumesList`. */
export const SeriesVolumeListItem = z.object({
  id: z.number().int(),
  number: z.number().int(),
  title: z.string().nullable(),
  status: z.enum(['imported', 'wanted']),
  publishedAt: z.string().nullable(),
  coverUrl: z.string().nullable(),
  libraryFileId: z.number().int().nullable(),
  read: ReadStateEnum,
});

/** GET /api/series/{id} — series row + summary enrichment + per-volume list. */
// readState omitted — per-volume read state lives in volumesList[n].read
// health omitted — not enriched on the detail endpoint
export const SeriesDetailResponse = SeriesRowWithGroupPath.extend({
  title: z.string(),
  monitored: z.boolean(),
  volumes: z.number().int(),
  downloaded: z.number().int(),
  volumesList: z.array(SeriesVolumeListItem),
  /** True while any background job (metadata/volume hydrate, chapter sync, import) is still running for this series. Clients can poll until false. */
  hydrating: z.boolean(),
});

/** One release of GET /api/series/{id}/releases — the releases table row
 *  (JSON-serialized) plus ownership + indexer labels. */
export const SeriesReleaseRow = z.object({
  id: z.number().int(),
  seriesId: z.number().int().nullable(),
  indexerId: z.number().int(),
  indexerGuid: z.string(),
  title: z.string(),
  link: z.string(),
  targetKind: z.enum(['volume', 'chapter', 'batch']),
  targetLow: z.number().nullable(),
  targetHigh: z.number().nullable(),
  groupName: z.string().nullable(),
  language: z.string().nullable(),
  sizeBytes: z.number().int(),
  seeders: z.number().int(),
  leechers: z.number().int(),
  publishedAt: z.string(),
  discoveredAt: z.string().nullable(),
  score: z.number().nullable(),
  trusted: z.boolean().nullable(),
  remake: z.boolean().nullable(),
  grabFailedAt: z.string().nullable(),
  grabAttempts: z.number().int(),
  rejectedAt: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  ownership: z.enum(['none', 'in-library', 'downloading']),
  indexerName: z.string().nullable(),
  indexerKind: z.string().nullable(),
});

export const SeriesReleasesResponse = z.object({
  releases: z.array(SeriesReleaseRow),
});

/** POST /api/series/{id}/manual-grab 201 body. */
export const ManualGrabResponse = z.object({
  releaseId: z.number().int(),
  downloadId: z.number().int(),
  qbtHash: z.string(),
  status: z.literal('queued'),
});

// Search hit shapes — mirror each provider's mapped hit row.

/** AniList-mapped hit (manga + light_novel; src/server/integrations/anilist/schemas.ts). */
export const MangaSearchHit = z.object({
  anilistId: z.number().int(),
  titleEnglish: z.string().nullable(),
  titleRomaji: z.string().nullable(),
  titleNative: z.string().nullable(),
  coverUrl: z.string().nullable(),
  status: StatusEnum,
  format: z.string().nullable(),
  startYear: z.number().int().nullable(),
  author: z.string().nullable().optional(),
});

/** ComicVine volume hit (src/server/integrations/comicvine/schemas.ts). */
export const ComicSearchHit = z.object({
  comicvineId: z.number().int(),
  name: z.string(),
  publisher: z.string().nullable(),
  startYear: z.number().int().nullable(),
  issueCount: z.number().int().nullable(),
  coverUrl: z.string().nullable(),
  description: z.string().nullable(),
});

/** OpenLibrary hit (src/server/integrations/openlibrary/client.ts). */
export const EbookSearchHit = z.object({
  olid: z.string(),
  title: z.string(),
  author: z.string().nullable(),
  firstPublishYear: z.number().int().nullable(),
  isbn: z.string().nullable(),
  coverUrl: z.string().nullable(),
});

/** Audnex hit (src/server/integrations/audnex/client.ts). */
export const AudiobookSearchHit = z.object({
  asin: z.string(),
  title: z.string(),
  author: z.string().nullable(),
  narrator: z.string().nullable(),
  releaseYear: z.number().int().nullable(),
  coverUrl: z.string().nullable(),
  runtimeMinutes: z.number().int().nullable(),
});

/** GET /api/series/search 200 — shape branches on contentType. Manga uses
 *  `hits`; the other four use `results` (docs/api.md → Quirks). */
export const SeriesSearchResponse = z.union([
  z.object({ contentType: z.literal('manga'), hits: z.array(MangaSearchHit) }),
  z.object({ contentType: z.literal('comic'), results: z.array(ComicSearchHit) }),
  z.object({ contentType: z.literal('light_novel'), results: z.array(MangaSearchHit) }),
  z.object({ contentType: z.literal('ebook'), results: z.array(EbookSearchHit) }),
  z.object({ contentType: z.literal('audiobook'), results: z.array(AudiobookSearchHit) }),
]);

/** POST /api/series/search 200 — manga hits only, no contentType discriminator. */
export const SeriesSearchPostResponse = z.object({
  hits: z.array(MangaSearchHit),
});
