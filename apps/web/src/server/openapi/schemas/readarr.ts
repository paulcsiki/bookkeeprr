import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Readarr-compat family (/api/readarr/v1/*) — the Calibre-Web-targeted adapter
// that exposes a subset of Readarr's v1 API (docs/api.md → "Readarr-compatible
// surface"). Request schemas are the single source of truth, used BOTH for
// runtime validation in the route handlers (app/api/readarr/v1/**) and for the
// generated OpenAPI spec; src/server/readarr/schemas.ts re-exports them for
// its existing importers.
//
// Auth-mode reality (verified against src/proxy.ts, 2026-06): the readarr
// routes pass through the SAME global auth gate as the native surface — a
// session cookie OR the X-Api-Key header both work (the handlers do not
// self-gate). Compat clients are expected to send X-Api-Key; the global
// bearerAuth/apiKeyAuth security default is accurate, so no per-op override.
//
// Error envelope: readarrError() emits `{ message, description? }` — Readarr's
// shape, NOT the native `{ error }` envelope.
//
// Response schemas mirror the mapper outputs (src/server/readarr/mappers.ts,
// queue-mapper.ts, history-mapper.ts, profiles.ts, command-dispatcher.ts) —
// the fields bookkeeprr actually emits, not the full Readarr API surface.
// ─────────────────────────────────────────────────────────────────────────────

/** Readarr-shaped error body (`readarrError()` in src/server/readarr/auth.ts). */
export const ReadarrErrorResponse = z.object({
  message: z.string(),
  description: z.string().optional(),
});

// ─── Request bodies (single source — runtime-validated in the routes) ────────

/** POST /api/readarr/v1/author body. */
export const ReadarrAuthorPostBody = z.object({
  foreignAuthorId: z
    .string()
    .optional()
    .describe(
      'Provider id per content type: openlibrary_id (ebook), asin (audiobook), ' +
        'anilist_id (light_novel/manga), mangadex_id (manga fallback), comicvine_id (comic).',
    ),
  authorName: z.string().min(1).optional(),
  metadataProfileId: z
    .number()
    .int()
    .refine((n) => n === 1 || n === 2 || n === 3 || n === 4 || n === 5, {
      message: 'metadataProfileId must be 1, 2, 3, 4, or 5',
    })
    .describe('Selects the content type: 1=ebook, 2=audiobook, 3=light_novel, 4=manga, 5=comic.'),
  qualityProfileId: z.number().int().positive(),
  rootFolderPath: z.string().min(1),
  monitored: z.boolean().optional(),
});

export type ReadarrAuthorPostBodyT = z.infer<typeof ReadarrAuthorPostBody>;

/** POST /api/readarr/v1/book body — creates a single-volume series. */
export const ReadarrBookPostBody = z.object({
  foreignBookId: z.string().min(1),
  metadataProfileId: z
    .number()
    .int()
    .refine((n) => n === 1 || n === 2 || n === 3 || n === 4 || n === 5, {
      message: 'metadataProfileId must be 1, 2, 3, 4, or 5',
    })
    .describe('Selects the content type: 1=ebook, 2=audiobook, 3=light_novel, 4=manga, 5=comic.'),
  qualityProfileId: z.number().int().positive(),
  rootFolderPath: z.string().min(1),
  rootPath: z.string().min(1).optional(),
  monitored: z.boolean().optional(),
});

export type ReadarrBookPostBodyT = z.infer<typeof ReadarrBookPostBody>;

/** PUT /api/readarr/v1/author/{id} body. Unrecognized fields (tags, …) are
 *  accepted and ignored — Readarr clients send the full author object back. */
export const ReadarrAuthorPutBody = z.looseObject({
  rootFolderPath: z.string().min(1).optional(),
  monitored: z.boolean().optional(),
  qualityProfileId: z.number().int().positive().optional(),
});

/** PUT /api/readarr/v1/book/{id} body. `monitored` is accepted and silently
 *  ignored; unrecognized fields pass through unvalidated. */
export const ReadarrBookPutBody = z.looseObject({
  title: z.string().min(1).optional(),
  monitored: z.boolean().optional(),
});

/** Shared ?page=&pageSize= query for /queue and /history. Invalid values fall
 *  back to the defaults rather than erroring. */
export const ReadarrPaginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/** ?term= query for /author/lookup and /book/lookup. */
export const ReadarrLookupQuery = z.object({
  term: z.string().min(1),
});

/** POST /api/readarr/v1/command body. The handler tolerates ANY body (even
 *  empty/invalid JSON — Calibre-Web occasionally POSTs nothing): a missing
 *  `name` is treated as a no-op. See docs/api.md → "POST /command semantics"
 *  for the name→job mapping. */
export const ReadarrCommandPostBody = z.looseObject({
  name: z
    .string()
    .optional()
    .describe(
      'RefreshAuthor / RefreshBook / RefreshAuthors / AuthorSearch / BookSearch / ' +
        'MissingBookSearch / RescanFolders; anything else is accepted as a no-op.',
    ),
  authorId: z
    .number()
    .int()
    .optional()
    .describe('bookkeeprr series id; required for the Refresh*/…Search commands to enqueue.'),
});

// ─── Shared response building blocks ─────────────────────────────────────────

/** Cover image attachment on author/book shapes. */
export const ReadarrImage = z.object({
  coverType: z.enum(['poster', 'cover']),
  url: z.string(),
});

/** Readarr Book = bookkeeprr volume (volumeToReadarrBook in mappers.ts). */
export const ReadarrBook = z.object({
  id: z.number().int().describe('bookkeeprr volume id.'),
  title: z.string(),
  authorId: z.number().int().describe('bookkeeprr series id.'),
  authorTitle: z.string(),
  foreignBookId: z.string(),
  monitored: z.boolean(),
  bookNumber: z.number().describe('Volume number; 1 when unknown.'),
  added: z.string().describe('ISO timestamp (series addedAt).'),
  releaseDate: z.string().nullable(),
  images: z.array(ReadarrImage),
});

/** Readarr Author = bookkeeprr series (seriesToReadarrAuthor in mappers.ts). */
export const ReadarrAuthor = z.object({
  id: z.number().int().describe('bookkeeprr series id.'),
  authorName: z.string().describe('Author; comics fall back to the publisher.'),
  foreignAuthorId: z.string(),
  status: z.enum(['continuing', 'ended']),
  monitored: z.boolean(),
  qualityProfileId: z.number().int(),
  metadataProfileId: z
    .number()
    .int()
    .min(1)
    .max(5)
    .describe('1=ebook, 2=audiobook, 3=light_novel, 4=manga, 5=comic.'),
  rootFolderPath: z.string(),
  path: z.string(),
  added: z.string().describe('ISO timestamp.'),
  images: z.array(ReadarrImage),
  books: z.array(ReadarrBook),
  overview: z.string(),
});

// ─── Connection-test endpoints ───────────────────────────────────────────────

/** GET /api/readarr/v1/system/status 200. */
export const ReadarrSystemStatusResponse = z.object({
  version: z.string(),
  appName: z.literal('bookkeeprr'),
  buildTime: z.string(),
  isDocker: z.boolean(),
  runtimeVersion: z.string(),
  startTime: z.string(),
});

/** One row of GET /api/readarr/v1/qualityprofile — bookkeeprr quality
 *  profiles in Readarr shape (upgradeAllowed/cutoff/items are static stubs). */
export const ReadarrQualityProfile = z.object({
  id: z.number().int(),
  name: z.string(),
  upgradeAllowed: z.boolean(),
  cutoff: z.number().int(),
  items: z.array(z.unknown()).describe('Always empty.'),
});

/** One row of GET /api/readarr/v1/metadataprofile — the five static profiles
 *  (1=ebook … 5=comic); every field except id/name is a static stub. */
export const ReadarrMetadataProfile = z.object({
  id: z.number().int().min(1).max(5),
  name: z.string(),
  minPopularity: z.number(),
  skipMissingDate: z.boolean(),
  skipMissingIsbn: z.boolean(),
  skipPartsAndSets: z.boolean(),
  skipSeriesSecondary: z.boolean(),
  allowedLanguages: z.string(),
  minPages: z.number().int(),
});

/** One row of GET /api/readarr/v1/rootfolder — one media root per content
 *  type (freeSpace/totalSpace are static stubs). */
export const ReadarrRootFolder = z.object({
  id: z.number().int(),
  path: z.string(),
  accessible: z.boolean(),
  freeSpace: z.number(),
  totalSpace: z.number(),
});

/** GET /api/readarr/v1/health 200 — always `[]` (stub; Readarr clients only
 *  check the shape). */
export const ReadarrHealthResponse = z.array(z.unknown());

// ─── Lookup shapes ───────────────────────────────────────────────────────────

/** One hit of GET /api/readarr/v1/author/lookup — federated metadata search
 *  result in Author shape (status/monitored/qualityProfileId/rootFolderPath/
 *  path/added/books are placeholder values until the author is added). */
export const ReadarrAuthorLookupResult = z.object({
  foreignAuthorId: z.string(),
  authorName: z.string(),
  overview: z.string(),
  images: z.array(ReadarrImage),
  metadataProfileId: z.number().int().min(1).max(5).nullable(),
  status: z.literal('continuing'),
  monitored: z.boolean(),
  qualityProfileId: z.number().int(),
  rootFolderPath: z.string(),
  path: z.string(),
  added: z.string(),
  books: z.array(z.unknown()).describe('Always empty.'),
});

/** One hit of GET /api/readarr/v1/book/lookup — federated search result in
 *  Book shape. `authorId` is a synthetic 1-based index, NOT a series id. */
export const ReadarrBookLookupResult = z.object({
  foreignBookId: z.string(),
  title: z.string(),
  authorTitle: z.string(),
  metadataProfileId: z.number().int().min(1).max(5).nullable(),
  monitored: z.boolean(),
  bookNumber: z.number().int(),
  authorId: z.number().int().describe('Synthetic 1-based result index, not a series id.'),
  images: z.array(ReadarrImage),
  releaseDate: z.null(),
  added: z.string(),
});

// ─── Command shapes ──────────────────────────────────────────────────────────

/** A Readarr command record — bookkeeprr job in Readarr shape. For dispatched
 *  no-ops, `id` is 0 and `status` is `completed`; for enqueued jobs `id` is
 *  the bookkeeprr jobId (poll GET /command/{id}) and `message` carries the
 *  bookkeeprr job kind. */
export const ReadarrCommandRecord = z.object({
  id: z.number().int(),
  name: z.string(),
  status: z.enum(['queued', 'started', 'completed', 'failed', 'aborted']),
  queued: z.string().nullable(),
  started: z.string().nullable(),
  ended: z.string().nullable(),
  duration: z.string().describe('hh:mm:ss.'),
  trigger: z.literal('manual'),
  message: z.string(),
});

// ─── Queue ───────────────────────────────────────────────────────────────────

/** One row of GET /api/readarr/v1/queue (downloadRowToQueueRecord). `sizeleft`
 *  is always 0 and `timeleft` "00:00:00" — bookkeeprr doesn't track byte-level
 *  progress. */
export const ReadarrQueueRecord = z.object({
  id: z.number().int().describe('bookkeeprr download id.'),
  authorId: z.number().int().describe('bookkeeprr series id.'),
  bookId: z.number().int().nullable().describe('bookkeeprr volume id when targeted.'),
  size: z.number(),
  sizeleft: z.number(),
  timeleft: z.string(),
  estimatedCompletionTime: z.string().nullable(),
  title: z.string(),
  status: z.enum(['queued', 'downloading', 'importPending', 'completed', 'failed']),
  trackedDownloadStatus: z.enum(['ok', 'warning', 'error']),
  trackedDownloadState: z.enum(['downloading', 'importing', 'imported', 'downloadFailed']),
  statusMessages: z.array(z.object({ title: z.string(), messages: z.array(z.string()) })),
  downloadId: z.string().describe('qBittorrent torrent hash.'),
  protocol: z.literal('torrent'),
  downloadClient: z.literal('qBittorrent'),
  indexer: z.string(),
  outputPath: z.string(),
  errorMessage: z.string().nullable(),
});

/** GET /api/readarr/v1/queue 200. */
export const ReadarrQueueResponse = z.object({
  records: z.array(ReadarrQueueRecord),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalRecords: z.number().int(),
  sortKey: z.literal('timeleft'),
  sortDirection: z.literal('ascending'),
});

// ─── History ─────────────────────────────────────────────────────────────────

/** One row of GET /api/readarr/v1/history — union of grabbed / imported /
 *  failed events (history-mapper.ts). `id` is a synthetic string like
 *  `grabbed-7`; `data` is `{}` except downloadFailed which carries
 *  `{ message }`. */
export const ReadarrHistoryRecord = z.object({
  id: z.string(),
  eventType: z.enum(['grabbed', 'bookFileImported', 'downloadFailed']),
  authorId: z.number().int().describe('bookkeeprr series id.'),
  bookId: z.number().int().nullable(),
  sourceTitle: z.string().describe('Release title; the file path for imports.'),
  date: z.string().describe('ISO timestamp.'),
  downloadId: z.string().describe('qBittorrent torrent hash ("" when unknown).'),
  data: z.record(z.string(), z.unknown()),
});

/** GET /api/readarr/v1/history 200. Capped at the most recent 1000 events. */
export const ReadarrHistoryResponse = z.object({
  records: z.array(ReadarrHistoryRecord),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalRecords: z.number().int(),
  sortKey: z.literal('date'),
  sortDirection: z.literal('descending'),
});
