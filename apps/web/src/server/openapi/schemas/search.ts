import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Request schemas — single source of truth, used BOTH for runtime validation in
// the route handlers (app/api/search/**) and for the generated OpenAPI spec.
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/search/interactive request body. */
export const InteractiveSearchBody = z.object({
  seriesId: z.number().int().positive(),
  queryOverride: z.string().min(1).optional(),
});

/** POST /api/search/interactive/grab request body — the `item` and `parsed`
 *  objects are passed back verbatim from an interactive-search result, so a
 *  non-matching result can be force-grabbed (the route upserts the release
 *  row before grabbing). */
export const InteractiveGrabBody = z.object({
  seriesId: z.number().int().positive(),
  item: z.object({
    guid: z.string().min(1),
    title: z.string().min(1),
    link: z.string().min(1),
    seeders: z.number().int(),
    leechers: z.number().int(),
    sizeBytes: z.number().int(),
    publishedAt: z.string().datetime(),
    indexerId: z.number().int().positive(),
  }),
  parsed: z.object({
    targetKind: z.enum(['volume', 'chapter', 'batch']),
    targetLow: z.number().nullable(),
    targetHigh: z.number().nullable(),
    group: z.string().nullable(),
    language: z.enum(['en', 'jp']),
    isBatch: z.boolean(),
  }),
  score: z.number().nullable().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Response schemas — authored from the handlers' actual NextResponse.json
// payloads. Plain z.object (unknown keys stripped) so additive fields are
// tolerated by the test assertions.
// ─────────────────────────────────────────────────────────────────────────────

/** Release-title parse result (src/server/parser/release.ts → ParsedRelease). */
export const ParsedRelease = z.object({
  cleanTitle: z.string(),
  targetKind: z.enum(['volume', 'chapter', 'batch']),
  targetLow: z.number().nullable(),
  targetHigh: z.number().nullable(),
  group: z.string().nullable(),
  language: z.enum(['en', 'jp']),
  isBatch: z.boolean(),
  confidence: z.number(),
  contentTypeHint: z.enum(['comic', 'prose', 'audio']).nullable(),
  debug: z.object({ matched: z.string().nullable(), stripped: z.string() }),
});

/** Matcher verdict (src/server/matcher/index.ts → MatchResult). */
export const MatchResult = z.union([
  z.object({ matches: z.literal(true), score: z.number() }),
  z.object({
    matches: z.literal(false),
    reason: z.enum([
      'title-mismatch',
      'granularity-mismatch',
      'content-type-mismatch',
      'language',
      'size',
      'adult-filter',
      'rejected',
    ]),
  }),
]);

/** Whether the targeted volumes/chapters are already owned or downloading. */
export const OwnershipEnum = z.enum(['none', 'in-library', 'downloading']);

/** The raw indexer item of one interactive-search result. */
export const InteractiveSearchItem = z.object({
  guid: z.string(),
  title: z.string(),
  link: z.string(),
  seeders: z.number().int(),
  leechers: z.number().int(),
  sizeBytes: z.number().int(),
  publishedAt: z.string(),
  indexerId: z.number().int(),
  indexerName: z.string(),
  indexerKind: z.string(),
  infoUrl: z.string().nullable(),
  freeleech: z.boolean().optional(),
  vip: z.boolean().optional(),
});

/** One result row of POST /api/search/interactive. `releaseId` is set only for
 *  matching results (they are upserted into the releases table as a side
 *  effect, so subsequent grabs work). */
export const InteractiveSearchResult = z.object({
  item: InteractiveSearchItem,
  parsed: ParsedRelease,
  matchResult: MatchResult,
  ownership: OwnershipEnum,
  releaseId: z.number().int().nullable(),
});

/** Per-indexer failure surfaced alongside (partial) results. */
export const IndexerSearchError = z.object({
  indexerId: z.number().int(),
  message: z.string(),
});

/** POST /api/search/interactive 200 — matches first (score desc), then
 *  non-matches (seeders desc). */
export const InteractiveSearchResponse = z.object({
  results: z.array(InteractiveSearchResult),
  errors: z.array(IndexerSearchError),
});

/** POST /api/search/interactive 502 — emitted only when EVERY enabled indexer
 *  failed and zero items were collected. */
export const InteractiveSearchFailureResponse = z.object({
  error: z.string(),
  errors: z.array(IndexerSearchError),
});
