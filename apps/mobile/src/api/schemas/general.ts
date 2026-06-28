import { z } from 'zod';

// ── Updates ──────────────────────────────────────────────────────────────────

export const UpdatesConfig = z.object({
  frequency: z.enum(['off', 'hourly', 'daily', 'weekly']),
  behavior: z.enum(['notify', 'auto-download', 'auto-install']),
  notifyOnIntegrations: z.boolean(),
  showChangelogOnFirstLaunch: z.boolean(),
});
export type UpdatesConfig = z.infer<typeof UpdatesConfig>;

export const UpdatesConfigResponse = z.object({ config: UpdatesConfig });
export type UpdatesConfigResponse = z.infer<typeof UpdatesConfigResponse>;

export const UpdatesState = z.object({
  latestVersion: z.string().nullable(),
  latestReleaseUrl: z.string().nullable(),
  latestReleaseBody: z.string().nullable(),
  latestPublishedAt: z.string().nullable(),
  fetchedAt: z.string().nullable(),
  fetchError: z.string().nullable(),
});
export type UpdatesState = z.infer<typeof UpdatesState>;

export const UpdatesCheckResponse = z.object({ state: UpdatesState });
export type UpdatesCheckResponse = z.infer<typeof UpdatesCheckResponse>;

// Build/runtime info from getBuildInfo() (apps/web/src/server/build-info.ts).
// `.passthrough()` keeps any future fields the server adds.
export const BuildInfo = z
  .object({
    version: z.string(),
    commit: z.string(),
    builtAt: z.string(),
    channel: z.string(),
    runtime: z.string(),
    uptime: z.number(),
  })
  .passthrough();
export type BuildInfo = z.infer<typeof BuildInfo>;

// GET /api/updates — the combined overview the Updates screen loads from.
export const UpdatesOverview = z.object({
  buildInfo: BuildInfo,
  state: UpdatesState,
  config: UpdatesConfig,
  deploymentMode: z.enum(['auto', 'docker', 'kubernetes']),
  updateAvailable: z.boolean(),
  lastSeenVersion: z.string().nullable(),
});
export type UpdatesOverview = z.infer<typeof UpdatesOverview>;

// POST /api/updates/check returns 429 with this body when rate-limited.
export const UpdatesRateLimited = z.object({
  error: z.literal('rate-limited'),
  retryAfterSeconds: z.number(),
});
export type UpdatesRateLimited = z.infer<typeof UpdatesRateLimited>;

// ── Auto-grab ─────────────────────────────────────────────────────────────────

export const AutoGrabConfig = z.object({
  dryRun: z.boolean(),
});
export type AutoGrabConfig = z.infer<typeof AutoGrabConfig>;

export const AutoGrabResponse = z.object({ config: AutoGrabConfig });
export type AutoGrabResponse = z.infer<typeof AutoGrabResponse>;

// ── Matcher ───────────────────────────────────────────────────────────────────

export const MatcherWeights = z.object({
  groupTopWeight: z.number(),
  groupStepDown: z.number(),
  batchBonus: z.number(),
  seederMultiplier: z.number(),
  trustedBonus: z.number(),
  remakePenalty: z.number(),
  // Hard pre-grab floor: releases with fewer seeders are skipped. Default 1;
  // `.default(1)` keeps older servers (whose GET omits the field) parseable.
  minSeeders: z.number().default(1),
});
export type MatcherWeights = z.infer<typeof MatcherWeights>;

export const AdultFilter = z.object({
  enabled: z.boolean(),
  blockedCategories: z.array(z.string()),
});
export type AdultFilter = z.infer<typeof AdultFilter>;

const AutoReplayEnqueued = z
  .union([z.object({ runId: z.number() }), z.object({ error: z.string() })])
  .optional();

export const MatcherWeightsResponse = z.object({
  config: MatcherWeights,
  autoReplayEnqueued: AutoReplayEnqueued,
});
export type MatcherWeightsResponse = z.infer<typeof MatcherWeightsResponse>;

export const AdultFilterResponse = z.object({
  config: AdultFilter,
  autoReplayEnqueued: AutoReplayEnqueued,
});
export type AdultFilterResponse = z.infer<typeof AdultFilterResponse>;

// Combined GET /api/settings/matcher returns the two configs side by side
// (not a single `{config}` wrapper) — see apps/web/src/app/api/settings/matcher/route.ts.
export const MatcherOverview = z.object({
  weights: MatcherWeights,
  adultFilter: AdultFilter,
});
export type MatcherOverview = z.infer<typeof MatcherOverview>;

// ── Housekeeping ──────────────────────────────────────────────────────────────

export const JobRetention = z.object({
  terminalDays: z.number(),
  errorDays: z.number(),
});
export type JobRetention = z.infer<typeof JobRetention>;

export const JobRetentionResponse = z.object({ config: JobRetention });
export type JobRetentionResponse = z.infer<typeof JobRetentionResponse>;

export const BackupRetention = z.object({
  daily: z.number(),
  monthlyDay1: z.number(),
});
export type BackupRetention = z.infer<typeof BackupRetention>;

export const BackupRetentionResponse = z.object({ config: BackupRetention });
export type BackupRetentionResponse = z.infer<typeof BackupRetentionResponse>;

export const VisibilityRetention = z.object({
  auditRetentionDays: z.number(),
  logRetentionDays: z.number(),
});
export type VisibilityRetention = z.infer<typeof VisibilityRetention>;

export const VisibilityRetentionResponse = z.object({ config: VisibilityRetention });
export type VisibilityRetentionResponse = z.infer<typeof VisibilityRetentionResponse>;

export const ReleaseRetention = z.object({
  keepPerSeries: z.number(),
  olderThanDays: z.number(),
});
export type ReleaseRetention = z.infer<typeof ReleaseRetention>;

export const ReleaseRetentionResponse = z.object({ config: ReleaseRetention });
export type ReleaseRetentionResponse = z.infer<typeof ReleaseRetentionResponse>;

// GET /api/settings/housekeeping returns the four retention configs directly
// (NOT `{config}`-wrapped) — see apps/web/src/app/api/settings/housekeeping/route.ts.
export const HousekeepingOverview = z.object({
  jobs: JobRetention,
  backups: BackupRetention,
  visibility: VisibilityRetention,
  releases: ReleaseRetention,
});
export type HousekeepingOverview = z.infer<typeof HousekeepingOverview>;

// ── Naming ────────────────────────────────────────────────────────────────────

// The five naming-template keys. `volume_subfolder` may be empty (flatten).
export const NamingTemplates = z.object({
  series_folder: z.string(),
  volume: z.string(),
  chapter: z.string(),
  batch: z.string(),
  volume_subfolder: z.string(),
});
export type NamingTemplates = z.infer<typeof NamingTemplates>;

// GET /api/settings/naming?contentType=<ct> → { contentType, templates }
// — see apps/web/src/app/api/settings/naming/route.ts.
export const NamingResponse = z.object({
  contentType: z.enum(['manga', 'comic', 'light_novel', 'ebook', 'audiobook']),
  templates: NamingTemplates,
});
export type NamingResponse = z.infer<typeof NamingResponse>;
