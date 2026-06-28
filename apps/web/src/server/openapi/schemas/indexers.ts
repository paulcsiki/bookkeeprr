import { z } from 'zod';
import { ContentTypeEnum } from './series';
export { MessageResponse } from './common';
export { OkResponse } from './downloads';

// ─────────────────────────────────────────────────────────────────────────────
// Request schemas — single source of truth, used BOTH for runtime validation in
// the route handlers (app/api/indexers/**) and for the generated OpenAPI spec.
// ─────────────────────────────────────────────────────────────────────────────

export const IndexerKindEnum = z.enum(['nyaa', 'filelist', 'torznab', 'mam']);

const PollIntervalSeconds = z.number().int().min(60).max(86400);

// Per-kind config bodies. The create (POST) variants require
// pollIntervalSeconds; the patch (PATCH) variants make it optional (the server
// re-applies the default when omitted).

const NyaaConfigCore = z.object({
  kind: z.literal('nyaa'),
  queryTemplate: z.string().min(1),
  contentTypes: z.array(ContentTypeEnum),
  categoryByContentType: z.partialRecord(ContentTypeEnum, z.enum(['3_1', '3_3'])),
});

const FilelistConfigCore = z.object({
  kind: z.literal('filelist'),
  queryTemplate: z.string().min(1),
  contentTypes: z.array(ContentTypeEnum),
  categoryByContentType: z.partialRecord(ContentTypeEnum, z.number().int().nonnegative()),
  username: z.string(),
});

const TorznabConfigCore = z.object({
  kind: z.literal('torznab'),
  queryTemplate: z.string().min(1),
  contentTypes: z.array(ContentTypeEnum),
  categoryByContentType: z.partialRecord(ContentTypeEnum, z.string()),
  prowlarrIndexerId: z.number().int().optional(),
});

export const NyaaConfigBody = NyaaConfigCore.extend({
  pollIntervalSeconds: PollIntervalSeconds,
});

export const FilelistConfigBody = FilelistConfigCore.extend({
  passkey: z.string(),
  pollIntervalSeconds: PollIntervalSeconds,
});

export const TorznabConfigBody = TorznabConfigCore.extend({
  apiKey: z.string(),
  pollIntervalSeconds: PollIntervalSeconds,
});

export const NyaaConfigPatchBody = NyaaConfigCore.extend({
  pollIntervalSeconds: PollIntervalSeconds.optional(),
});

export const FilelistConfigPatchBody = FilelistConfigCore.extend({
  passkey: z
    .string()
    .describe(
      'Masked to "" on GET. Send "" to leave the stored passkey unchanged; send a real value to rotate it.',
    ),
  pollIntervalSeconds: PollIntervalSeconds.optional(),
});

export const TorznabConfigPatchBody = TorznabConfigCore.extend({
  apiKey: z
    .string()
    .describe(
      'Masked to "" on GET. Send "" to leave the stored API key unchanged; send a real value to rotate it.',
    ),
  pollIntervalSeconds: PollIntervalSeconds.optional(),
});

const MamConfigCore = z.object({
  kind: z.literal('mam'),
  queryTemplate: z.string().min(1),
  contentTypes: z.array(ContentTypeEnum),
  categoryByContentType: z.partialRecord(ContentTypeEnum, z.number().int().nonnegative()),
  proxyUrl: z.string(),
  searchIn: z.array(z.string()),
});

export const MamConfigBody = MamConfigCore.extend({
  mamId: z.string(),
  pollIntervalSeconds: PollIntervalSeconds,
});

export const MamConfigPatchBody = MamConfigCore.extend({
  mamId: z
    .string()
    .describe(
      'Masked to "" on GET. Send "" to leave the stored session unchanged; send a real value to rotate it.',
    ),
  pollIntervalSeconds: PollIntervalSeconds.optional(),
});

/** Per-kind config union for POST /api/indexers. */
export const IndexerConfigBody = z.discriminatedUnion('kind', [
  NyaaConfigBody,
  FilelistConfigBody,
  TorznabConfigBody,
  MamConfigBody,
]);

/** Per-kind config union for PATCH /api/indexers/{id}. */
export const IndexerConfigPatchBody = z.discriminatedUnion('kind', [
  NyaaConfigPatchBody,
  FilelistConfigPatchBody,
  TorznabConfigPatchBody,
  MamConfigPatchBody,
]);

/** POST /api/indexers request body. `kind` must match `configJson.kind`. */
export const IndexerCreateBody = z.object({
  kind: IndexerKindEnum,
  name: z.string().min(1),
  baseUrl: z.string().url(),
  enabled: z.boolean().default(false),
  configJson: IndexerConfigBody,
});

/** PATCH /api/indexers/{id} request body. `configJson.kind` must match the
 *  existing row's kind. */
export const IndexerPatchBody = z.object({
  enabled: z.boolean().optional(),
  configJson: IndexerConfigPatchBody.optional(),
  name: z.string().optional(),
});

/** POST /api/indexers/prowlarr/sync request body. When both fields are
 *  present the connection is persisted before syncing; otherwise the stored
 *  connection is used. */
export const ProwlarrSyncBody = z.object({
  url: z.string().url().optional(),
  apiKey: z.string().optional(),
});

/** POST /api/indexers/prowlarr/test request body. Blank/absent fields fall
 *  back to the stored connection so a test works without re-entering the
 *  masked key. */
export const ProwlarrTestBody = z.object({
  url: z.string().optional(),
  apiKey: z.string().optional(),
});

/** POST /api/indexers/torznab/caps request body. */
export const TorznabCapsBody = z.object({
  url: z.string().url(),
  apiKey: z
    .string()
    .describe(
      'Send "" together with `indexerId` to fall back to that row\'s stored API key (the edit form masks it).',
    ),
  // When editing an existing indexer the API key field is masked (blank); pass
  // the row id so the server falls back to the stored key.
  indexerId: z.number().int().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Response schemas — authored from the handlers' actual NextResponse.json
// payloads. Plain z.object (unknown keys stripped) so additive fields are
// tolerated by the test assertions.
// ─────────────────────────────────────────────────────────────────────────────

/** One row of GET /api/indexers. The internal 'manual' sentinel indexer
 *  (holds hand-added torrents) is never included. */
export const IndexerRow = z.object({
  id: z.number().int(),
  kind: IndexerKindEnum,
  name: z.string(),
  baseUrl: z.string(),
  enabled: z.boolean(),
  configJson: z
    .string()
    .describe(
      'JSON-encoded per-kind config object. Secrets within (filelist `passkey`, torznab `apiKey`, mam `mamId`) are masked to "".',
    ),
  lastRssAt: z.string().nullable(),
  lastSearchAt: z.string().nullable(),
});

/** GET /api/indexers 200. */
export const IndexersListResponse = z.object({
  indexers: z.array(IndexerRow),
});

/** POST /api/indexers 201 — id of the created row. */
export const IndexerCreateResponse = z.object({ id: z.number().int() });

/** POST /api/indexers/prowlarr/sync 200 — sync summary counters. */
export const ProwlarrSyncResponse = z.object({
  added: z.number().int(),
  updated: z.number().int(),
  disabled: z.number().int(),
});

/** POST /api/indexers/torznab/caps 200 — the endpoint's category tree. */
export const TorznabCapsResponse = z.object({
  categories: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      subcats: z.array(z.object({ id: z.string(), name: z.string() })),
    }),
  ),
});
