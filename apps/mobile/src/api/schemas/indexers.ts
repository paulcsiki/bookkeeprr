import { z } from 'zod';

// The five content types a release can map to, in the SERVER's raw vocabulary
// (light_novel / audiobook) — these are the literal keys in
// categoryByContentType, so we must NOT remap them the way schemas/series.ts
// does. Mirrors CONTENT_TYPES in @bookkeeprr/types/pure.
export const IndexerContentType = z.enum(['manga', 'comic', 'light_novel', 'ebook', 'audiobook']);
export type IndexerContentType = z.infer<typeof IndexerContentType>;

export const IndexerKind = z.enum(['nyaa', 'filelist', 'torznab', 'mam']);
export type IndexerKind = z.infer<typeof IndexerKind>;

export const NyaaCategory = z.enum(['3_1', '3_3']);
export type NyaaCategory = z.infer<typeof NyaaCategory>;

// Config shapes mirror apps/web/src/server/integrations/indexers/types.ts. The
// server stores these as a JSON string in IndexerView.configJson; on GET it
// blanks secrets (Filelist passkey, Torznab apiKey) to ''. We model them as a
// discriminated union on `kind` so a parsed config narrows cleanly.
export const NyaaConfig = z.object({
  kind: z.literal('nyaa'),
  queryTemplate: z.string(),
  contentTypes: z.array(IndexerContentType),
  categoryByContentType: z.partialRecord(IndexerContentType, NyaaCategory),
  pollIntervalSeconds: z.number(),
});
export type NyaaConfig = z.infer<typeof NyaaConfig>;

export const FilelistConfig = z.object({
  kind: z.literal('filelist'),
  queryTemplate: z.string(),
  contentTypes: z.array(IndexerContentType),
  categoryByContentType: z.partialRecord(IndexerContentType, z.number()),
  username: z.string(),
  // Masked to '' on GET. On edit, '' means "keep stored".
  passkey: z.string(),
  pollIntervalSeconds: z.number(),
});
export type FilelistConfig = z.infer<typeof FilelistConfig>;

export const TorznabConfig = z.object({
  kind: z.literal('torznab'),
  queryTemplate: z.string(),
  contentTypes: z.array(IndexerContentType),
  // Newznab category ids per content type, comma-separated (e.g. "7020,8000").
  categoryByContentType: z.partialRecord(IndexerContentType, z.string()),
  // Masked to '' on GET. On edit, '' means "keep stored".
  apiKey: z.string(),
  pollIntervalSeconds: z.number(),
  // Set when this row is managed by Prowlarr auto-sync.
  prowlarrIndexerId: z.number().optional(),
});
export type TorznabConfig = z.infer<typeof TorznabConfig>;

export const MamConfig = z.object({
  kind: z.literal('mam'),
  queryTemplate: z.string(),
  contentTypes: z.array(IndexerContentType),
  categoryByContentType: z.partialRecord(IndexerContentType, z.number()),
  mamId: z.string(),     // masked to '' on GET
  proxyUrl: z.string(),
  searchIn: z.array(z.string()),
  pollIntervalSeconds: z.number(),
});
export type MamConfig = z.infer<typeof MamConfig>;

export const IndexerConfig = z.discriminatedUnion('kind', [NyaaConfig, FilelistConfig, TorznabConfig, MamConfig]);
export type IndexerConfig = z.infer<typeof IndexerConfig>;

// GET /api/indexers returns configJson as a JSON STRING (the route JSON.stringifies
// the parsed+masked config). Keep it as a string on the view and parse on demand.
export const IndexerView = z.object({
  id: z.number(),
  kind: IndexerKind,
  name: z.string(),
  baseUrl: z.string(),
  enabled: z.boolean(),
  configJson: z.string(),
  lastRssAt: z.string().nullable(),
  lastSearchAt: z.string().nullable(),
});
export type IndexerView = z.infer<typeof IndexerView>;

export const IndexersResponse = z.object({
  indexers: z.array(IndexerView),
});
export type IndexersResponse = z.infer<typeof IndexersResponse>;

/** Parse the JSON-string configJson from an IndexerView into the typed union. */
export function parseIndexerConfig(configJson: string): IndexerConfig {
  return IndexerConfig.parse(JSON.parse(configJson));
}

// POST /api/indexers body.
export const CreateIndexerBody = z.object({
  kind: IndexerKind,
  name: z.string(),
  baseUrl: z.string(),
  enabled: z.boolean(),
  configJson: IndexerConfig,
});
export type CreateIndexerBody = z.infer<typeof CreateIndexerBody>;

export const CreateIndexerResponse = z.object({ id: z.number() });
export type CreateIndexerResponse = z.infer<typeof CreateIndexerResponse>;

// PATCH /api/indexers/:id body (blank secrets = keep).
export const UpdateIndexerBody = z.object({
  enabled: z.boolean().optional(),
  name: z.string().optional(),
  configJson: IndexerConfig.optional(),
});
export type UpdateIndexerBody = z.infer<typeof UpdateIndexerBody>;

// POST /api/indexers/torznab/caps response.
export const TorznabCapsSubcat = z.object({ id: z.string(), name: z.string() });
export const TorznabCapsCategory = z.object({
  id: z.string(),
  name: z.string(),
  subcats: z.array(TorznabCapsSubcat),
});
export const TorznabCaps = z.object({
  categories: z.array(TorznabCapsCategory),
});
export type TorznabCaps = z.infer<typeof TorznabCaps>;

// POST /api/indexers/prowlarr/sync result.
export const ProwlarrSyncResult = z.object({
  added: z.number(),
  updated: z.number(),
  disabled: z.number(),
});
export type ProwlarrSyncResult = z.infer<typeof ProwlarrSyncResult>;

// POST /api/indexers/prowlarr/test result (server returns { ok: true } on
// success; on failure it returns { error } with a 5xx — mapped in the hook).
export const ProwlarrTestResult = z.object({ ok: z.boolean() });
export type ProwlarrTestResult = z.infer<typeof ProwlarrTestResult>;

// The stored Prowlarr connection, loaded/saved via GET/PUT /api/settings/prowlarr.
// On GET the apiKey is masked to '****' when set / '' when unset; on PUT a blank
// or '****' apiKey tells the server to keep the stored key (blank = keep).
export const ProwlarrConfig = z.object({ url: z.string(), apiKey: z.string() });
export type ProwlarrConfig = z.infer<typeof ProwlarrConfig>;
