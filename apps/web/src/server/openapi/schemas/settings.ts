import { z } from 'zod';
import { ContentTypeEnum } from './series';

// ─────────────────────────────────────────────────────────────────────────────
// Settings family — request schemas are the single source of truth, used BOTH
// for runtime validation in the route handlers (app/api/settings/**, plus the
// qbt/comicvine connection tests) and for the generated OpenAPI spec. Some are
// also the persistence schemas: the DAL modules under src/server/db/settings/
// re-import them from here (qbt, flaresolverr, search-providers, library).
//
// Masked-secret idiom (per area — reality varies, see each field's describe()):
// - qBittorrent / ComicVine / Google Books / MAL / NYT / Prowlarr: GET masks
//   the secret to "****" ("" when unset); on PUT, "" (or the literal "****")
//   keeps the stored value. There is NO null-clear on these.
// - Notifications / Audiobookshelf / Calibre: GET masks to "••••••••" (null
//   when unset); on PATCH, "" keeps the stored value and null clears it.
//
// Library-sync (Audiobookshelf / Calibre) schemas live in
// ./settings-library-sync.ts.
// ─────────────────────────────────────────────────────────────────────────────

/** `{ ok: true }` — the shared settings-update success envelope. */
export const SettingsOkResponse = z.object({ ok: z.literal(true) });

/** Connection-test failure body (always paired with HTTP 502). */
export const ConnectionTestFailureResponse = z.object({
  ok: z.literal(false),
  error: z.string(),
});

// ─── qBittorrent ─────────────────────────────────────────────────────────────

/** qBittorrent connection — persistence schema AND PUT /api/settings/qbt body. */
export const QbtConnectionSchema = z.object({
  host: z.string(),
  port: z.number().int().min(1).max(65535),
  username: z.string(),
  password: z
    .string()
    .describe(
      'Masked to "****" on GET ("" when unset). Send "" to keep the stored password; send a real value to rotate. There is no null-clear.',
    ),
  useHttps: z.boolean(),
});

/** GET /api/settings/qbt 200. */
export const QbtSettingsResponse = z.object({
  host: z.string(),
  port: z.number().int(),
  username: z.string(),
  password: z.string().describe('"****" when a password is stored, "" otherwise.'),
  useHttps: z.boolean(),
});

/** POST /api/qbt/test-connection body — password optional: blank falls back to
 *  the stored password (the GET route masks it, so a Test without re-typing
 *  still works). */
export const QbtTestConnectionBody = QbtConnectionSchema.extend({
  password: z
    .string()
    .optional()
    .describe('Blank/absent falls back to the stored password.'),
});

// ─── Naming templates ────────────────────────────────────────────────────────

/** GET|PUT /api/settings/naming query. */
export const NamingQuery = z.object({
  contentType: ContentTypeEnum.optional().describe('Defaults to "manga" (back-compat).'),
});

/** PUT /api/settings/naming body. Only the keys valid for the content type are
 *  applied (e.g. `chapter` only for manga/comic; `volume_subfolder` where the
 *  type uses volume subfolders — "" flattens). */
export const NamingPutBody = z.object({
  templates: z.object({
    series_folder: z.string().optional(),
    volume: z.string().optional(),
    chapter: z.string().optional(),
    batch: z.string().optional(),
    volume_subfolder: z.string().optional(),
  }),
});

/** GET /api/settings/naming 200 — only the keys valid for the content type
 *  are present. */
export const NamingGetResponse = z.object({
  contentType: ContentTypeEnum,
  templates: z.object({
    series_folder: z.string().optional(),
    volume: z.string().optional(),
    chapter: z.string().optional(),
    batch: z.string().optional(),
    volume_subfolder: z.string().optional(),
  }),
});

// ─── ComicVine ───────────────────────────────────────────────────────────────

/** PUT /api/settings/comicvine body. */
export const ComicVinePutBody = z.object({
  apiKey: z
    .string()
    .describe(
      'Masked to "****" on GET ("" when unset). Send "" to keep the stored key; send a real value to rotate. There is no null-clear.',
    ),
});

/** GET /api/settings/comicvine 200. */
export const ComicVineSettingsResponse = z.object({
  apiKey: z.string().describe('"****" when a key is stored, "" otherwise.'),
});

/** POST /api/comicvine/test-connection body — blank/absent key falls back to
 *  the stored key. */
export const ComicVineTestConnectionBody = z.object({
  apiKey: z.string().optional().describe('Blank/absent falls back to the stored key.'),
});

// ─── Prowlarr connection ─────────────────────────────────────────────────────

/** PUT /api/settings/prowlarr body. */
export const ProwlarrSettingsPutBody = z.object({
  url: z.string(),
  apiKey: z
    .string()
    .describe(
      'Masked to "****" on GET ("" when unset). Send "" or "****" to keep the stored key; send a real value to rotate. There is no null-clear.',
    ),
});

/** GET /api/settings/prowlarr 200. */
export const ProwlarrSettingsResponse = z.object({
  url: z.string(),
  apiKey: z.string().describe('"****" when a key is stored, "" otherwise.'),
});

// ─── Google Books ────────────────────────────────────────────────────────────

/** PUT /api/settings/googlebooks body. */
export const GoogleBooksPutBody = z.object({
  apiKey: z
    .string()
    .describe(
      'Masked to "****" on GET ("" when unset). Send "" to keep the stored key; send a real value to rotate. There is no null-clear.',
    ),
});

/** GET /api/settings/googlebooks 200. */
export const GoogleBooksSettingsResponse = z.object({
  apiKey: z.string().describe('"****" when a key is stored, "" otherwise.'),
});

// ─── MyAnimeList ─────────────────────────────────────────────────────────────

/** PUT /api/settings/mal body. */
export const MalPutBody = z.object({
  clientId: z
    .string()
    .describe(
      'Masked to "****" on GET ("" when unset). Send "" or "****" to keep the stored Client ID; send a real value to rotate. There is no null-clear.',
    ),
});

/** GET /api/settings/mal 200. */
export const MalSettingsResponse = z.object({
  clientId: z.string().describe('"****" when a Client ID is stored, "" otherwise.'),
});

/** POST /api/settings/mal/test body — omit `clientId` to test the stored one. */
export const MalTestBody = z.object({
  clientId: z.string().min(1).optional().describe('Omit to test the stored Client ID.'),
});

// ─── NYT Books API ───────────────────────────────────────────────────────────

/** PUT /api/settings/nyt body. */
export const NytPutBody = z.object({
  apiKey: z
    .string()
    .describe(
      'Masked to "****" on GET ("" when unset). Send "" or "****" to keep the stored key; send a real value to rotate. There is no null-clear.',
    ),
});

/** GET /api/settings/nyt 200. */
export const NytSettingsResponse = z.object({
  apiKey: z.string().describe('"****" when a key is stored, "" otherwise.'),
});

/** POST /api/settings/nyt/test body — omit `apiKey` to test the stored one. */
export const NytTestBody = z.object({
  apiKey: z.string().min(1).optional().describe('Omit to test the stored API key.'),
});

// ─── FlareSolverr ────────────────────────────────────────────────────────────

/** FlareSolverr endpoint — persistence schema AND PUT /api/settings/flaresolverr
 *  body. Not a secret: the URL round-trips unmasked. "" disables. */
export const FlaresolverrSchema = z.object({
  url: z.string(),
});

/** POST /api/settings/flaresolverr/test body — omit `url` to test the stored one. */
export const FlaresolverrTestBody = z.object({
  url: z.string().min(1).optional().describe('Omit to test the stored URL.'),
});

// ─── Discover ────────────────────────────────────────────────────────────────

/** PUT /api/settings/discover body. */
export const DiscoverPutBody = z.object({
  trendingSource: z.enum(['anilist', 'mal']),
});

/** GET /api/settings/discover 200. */
export const DiscoverSettingsResponse = z.object({
  trendingSource: z.enum(['anilist', 'mal']),
});

// ─── Search providers ────────────────────────────────────────────────────────

/** Discovery search-provider toggles — persistence schema AND (strict) the
 *  PUT /api/settings/search-providers body. The PUT requires the full shape. */
export const SearchProvidersSchema = z.object({
  anilist: z.boolean(),
  mal: z.boolean(),
  mangadex: z.boolean(),
  comicvine: z.boolean(),
  openlibrary: z.boolean(),
  audnex: z.boolean(),
  novelupdates: z.boolean(),
});

// ─── Storage ─────────────────────────────────────────────────────────────────

const ContentTypePathEntry = z
  .object({
    libraryRoot: z.string(),
    qbtCategory: z.string(),
  })
  .strict();

// Built from ContentTypeEnum so a new content type cannot drift out of sync.
const contentTypePathsShape = Object.fromEntries(
  ContentTypeEnum.options.map((t) => [t, ContentTypePathEntry]),
) as Record<z.infer<typeof ContentTypeEnum>, typeof ContentTypePathEntry>;

/** Per-content-type library root + qBittorrent category overrides ("" → fallback). */
export const ContentTypePathsSchema = z.object(contentTypePathsShape).strict();

/** Opt-in torrent removal policy. */
export const TorrentCleanupSchema = z
  .object({
    mode: z.enum(['never', 'after_import', 'after_ratio', 'after_seed_time']),
    ratio: z.number().positive().optional(),
    seedMinutes: z.number().int().positive().optional(),
    deleteFiles: z.boolean(),
  })
  .strict();

/** Opt-in server-side cover cache. */
export const ImageCacheSchema = z
  .object({
    enabled: z.boolean(),
    dir: z.string().describe('"" uses the default `<config dir>/cache/images`.'),
  })
  .strict();

/** PUT /api/settings/storage body. */
export const StoragePutBody = z.object({
  contentTypePaths: ContentTypePathsSchema,
  torrentCleanup: TorrentCleanupSchema,
  // Optional so older clients that don't send it keep working.
  imageCache: ImageCacheSchema.optional(),
});

/** GET /api/settings/storage 200. */
export const StorageSettingsResponse = z.object({
  contentTypePaths: ContentTypePathsSchema,
  torrentCleanup: TorrentCleanupSchema,
  imageCache: ImageCacheSchema,
});

// ─── Notifications ───────────────────────────────────────────────────────────

/** PATCH /api/settings/notifications body. Webhook fields: "" keeps the stored
 *  value, null clears it, a real value replaces it. */
export const NotificationsPatchBody = z.object({
  discordWebhookUrl: z
    .string()
    .nullable()
    .describe('Masked to "••••••••" on GET. "" keeps the stored URL; null clears it.'),
  discordUsername: z.string(),
  discordAvatarUrl: z
    .string()
    .nullable()
    .describe('"" keeps the stored URL; null clears it.'),
  appriseUrl: z
    .string()
    .nullable()
    .describe('Masked to "••••••••" on GET. "" keeps the stored URL; null clears it.'),
  eventGrabSuccess: z.boolean(),
  eventImportSuccess: z.boolean(),
  eventFailure: z.boolean(),
  eventUpdateAvailable: z.boolean().optional(),
});

/** GET /api/settings/notifications 200. */
export const NotificationsGetResponse = z.object({
  discordWebhookUrl: z
    .string()
    .nullable()
    .describe('"••••••••" when configured, null otherwise (never the real URL).'),
  discordWebhookConfigured: z.boolean(),
  discordUsername: z.string(),
  discordAvatarUrl: z.string().nullable(),
  appriseUrl: z
    .string()
    .nullable()
    .describe('"••••••••" when configured, null otherwise (never the real URL).'),
  appriseConfigured: z.boolean(),
  eventGrabSuccess: z.boolean(),
  eventImportSuccess: z.boolean(),
  eventFailure: z.boolean(),
  eventUpdateAvailable: z.boolean(),
});

/** Per-transport result inside the notifications-test response. */
const TransportResult = z.union([
  z.enum(['ok', 'not-configured']),
  z.object({ error: z.string() }),
]);

/** POST /api/settings/notifications/test 200 — always 200; failures are
 *  reported per transport. */
export const NotificationsTestResponse = z.object({
  discord: TransportResult,
  apprise: TransportResult,
});

// ─── API key ─────────────────────────────────────────────────────────────────

/** PATCH /api/settings/api-key body. */
export const ApiKeyPatchBody = z.object({
  action: z.enum(['generate', 'disable']),
});

/** GET /api/settings/api-key 200 — note the key is returned in PLAINTEXT (the
 *  admin UI shows it for copy/paste); it is NOT masked like other secrets. */
export const ApiKeyGetResponse = z.object({
  enabled: z.boolean(),
  key: z.string().describe('The actual key (plaintext) when enabled, "" when disabled.'),
  createdAt: z.string().nullable(),
});

/** PATCH /api/settings/api-key 200 — `generate` returns the new plaintext key;
 *  `disable` returns `{ enabled: false, key: "", createdAt: null }`. */
export const ApiKeyPatchResponse = z.object({
  enabled: z.boolean(),
  key: z.string(),
  createdAt: z.string().nullable(),
});

/** POST /api/settings/api-key/test 200 — `note` appears only when auth is
 *  disabled (no key set), in which case any request would succeed. */
export const ApiKeyTestResponse = z.object({
  ok: z.literal(true),
  note: z.string().optional(),
});

// ─── Auto-grab ───────────────────────────────────────────────────────────────

/** PATCH /api/settings/auto-grab body. */
export const AutoGrabPatchBody = z
  .object({
    dryRun: z.boolean().optional(),
  })
  .strict();

/** The auto-grab config blob (GET 200 returns it bare). */
export const AutoGrabConfigResponse = z.object({
  dryRun: z.boolean(),
});

/** PATCH /api/settings/auto-grab 200. */
export const AutoGrabPatchResponse = z.object({
  config: AutoGrabConfigResponse,
});

// ─── Housekeeping ────────────────────────────────────────────────────────────

const JobRetention = z.object({
  terminalDays: z.number().int(),
  errorDays: z.number().int(),
});

const BackupRetention = z.object({
  daily: z.number().int(),
  monthlyDay1: z.number().int(),
});

const VisibilityRetention = z.object({
  auditRetentionDays: z.number().int(),
  logRetentionDays: z.number().int(),
});

const ReleaseRetention = z.object({
  keepPerSeries: z.number().int(),
  olderThanDays: z.number().int(),
});

/** GET /api/settings/housekeeping 200. */
export const HousekeepingGetResponse = z.object({
  jobs: JobRetention,
  backups: BackupRetention,
  visibility: VisibilityRetention,
  releases: ReleaseRetention,
});

/** PATCH /api/settings/housekeeping/jobs body. */
export const HousekeepingJobsPatchBody = z
  .object({
    terminalDays: z.number().int().min(1).max(3650).optional(),
    errorDays: z.number().int().min(1).max(3650).optional(),
  })
  .strict();

/** PATCH /api/settings/housekeeping/backups body. */
export const HousekeepingBackupsPatchBody = z
  .object({
    daily: z.number().int().min(0).max(365).optional(),
    monthlyDay1: z.number().int().min(0).max(365).optional(),
  })
  .strict();

/** PATCH /api/settings/housekeeping/releases body. */
export const HousekeepingReleasesPatchBody = z
  .object({
    keepPerSeries: z.number().int().min(0).max(10000).optional(),
    olderThanDays: z.number().int().min(1).max(3650).optional(),
  })
  .strict();

/** PATCH /api/settings/housekeeping/visibility body. */
export const HousekeepingVisibilityPatchBody = z
  .object({
    auditRetentionDays: z.number().int().min(1).max(3650).optional(),
    logRetentionDays: z.number().int().min(1).max(365).optional(),
  })
  .strict();

export const HousekeepingJobsPatchResponse = z.object({ config: JobRetention });
export const HousekeepingBackupsPatchResponse = z.object({ config: BackupRetention });
export const HousekeepingReleasesPatchResponse = z.object({ config: ReleaseRetention });
export const HousekeepingVisibilityPatchResponse = z.object({ config: VisibilityRetention });

// ─── Updates ─────────────────────────────────────────────────────────────────

/** PATCH /api/settings/updates body. */
export const UpdatesPatchBody = z
  .object({
    frequency: z.enum(['hourly', 'daily', 'weekly', 'off']).optional(),
    behavior: z.enum(['notify', 'auto-download', 'auto-install']).optional(),
    notifyOnIntegrations: z.boolean().optional(),
    showChangelogOnFirstLaunch: z.boolean().optional(),
  })
  .strict();

/** PATCH /api/settings/updates 200. */
export const UpdatesPatchResponse = z.object({
  config: z.object({
    frequency: z.enum(['hourly', 'daily', 'weekly', 'off']),
    behavior: z.enum(['notify', 'auto-download', 'auto-install']),
    notifyOnIntegrations: z.boolean(),
    showChangelogOnFirstLaunch: z.boolean(),
  }),
});

// ─── Matcher ─────────────────────────────────────────────────────────────────

const ScoringWeights = z.object({
  groupTopWeight: z.number().int(),
  groupStepDown: z.number().int(),
  batchBonus: z.number().int(),
  seederMultiplier: z.number().int(),
  trustedBonus: z.number().int(),
  remakePenalty: z.number().int(),
  minSeeders: z.number().int(),
});

const AdultFilter = z.object({
  enabled: z.boolean(),
  blockedCategories: z.array(z.string()),
});

/** GET /api/settings/matcher 200. */
export const MatcherGetResponse = z.object({
  weights: ScoringWeights,
  adultFilter: AdultFilter,
});

/** PATCH /api/settings/matcher/weights body. */
export const MatcherWeightsPatchBody = z
  .object({
    groupTopWeight: z.number().int().min(0).max(1000).optional(),
    groupStepDown: z.number().int().min(0).max(100).optional(),
    batchBonus: z.number().int().min(0).max(1000).optional(),
    seederMultiplier: z.number().int().min(0).max(100).optional(),
    trustedBonus: z.number().int().min(0).max(1000).optional(),
    remakePenalty: z.number().int().min(-1000).max(0).optional(),
    minSeeders: z.number().int().min(0).max(10000).optional(),
  })
  .strict();

/** PATCH /api/settings/matcher/adult-filter body. */
export const MatcherAdultFilterPatchBody = z
  .object({
    enabled: z.boolean().optional(),
    blockedCategories: z.array(z.string().max(32)).optional(),
  })
  .strict();

/** PATCH /api/settings/matcher/auto-replay body. */
export const MatcherAutoReplayPatchBody = z.object({ enabled: z.boolean() }).strict();

/** Present only when "auto-replay on save" is enabled and a replay was
 *  (or failed to be) enqueued. */
const AutoReplayEnqueued = z.union([
  z.object({ runId: z.number().int() }),
  z.object({ error: z.string() }),
]);

/** PATCH /api/settings/matcher/weights 200. */
export const MatcherWeightsPatchResponse = z.object({
  config: ScoringWeights,
  autoReplayEnqueued: AutoReplayEnqueued.optional(),
});

/** PATCH /api/settings/matcher/adult-filter 200. */
export const MatcherAdultFilterPatchResponse = z.object({
  config: AdultFilter,
  autoReplayEnqueued: AutoReplayEnqueued.optional(),
});

/** PATCH /api/settings/matcher/auto-replay 200. */
export const MatcherAutoReplayPatchResponse = z.object({ enabled: z.boolean() });
