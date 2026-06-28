import { z } from 'zod';
import { defineSetting } from '../settings';

// Legacy shape written by schema versions before DS11c.
const LegacyUpdatesConfigSchema = z.object({ enabled: z.boolean() }).passthrough();

function migrateLegacyUpdatesConfig(raw: unknown): unknown {
  const legacy = LegacyUpdatesConfigSchema.safeParse(raw);
  if (legacy.success && 'enabled' in legacy.data && !('frequency' in legacy.data)) {
    const { enabled, ...rest } = legacy.data as Record<string, unknown>;
    return { ...rest, frequency: enabled ? 'daily' : 'off' };
  }
  return raw;
}

export const UpdatesConfigSchema = z.preprocess(
  migrateLegacyUpdatesConfig,
  z
    .object({
      frequency: z.enum(['hourly', 'daily', 'weekly', 'off']).default('daily'),
      behavior: z.enum(['notify', 'auto-download', 'auto-install']).default('notify'),
      notifyOnIntegrations: z.boolean(),
      showChangelogOnFirstLaunch: z.boolean(),
    })
    .strict(),
);

export type UpdatesConfig = z.infer<typeof UpdatesConfigSchema>;

export const DEFAULT_UPDATES_CONFIG: UpdatesConfig = {
  frequency: 'daily',
  behavior: 'notify',
  notifyOnIntegrations: false,
  showChangelogOnFirstLaunch: true,
};

export const updatesConfigSetting = defineSetting(
  'updates.config',
  UpdatesConfigSchema,
  DEFAULT_UPDATES_CONFIG,
);

export const UpdatesStateSchema = z
  .object({
    latestVersion: z.string().nullable(),
    latestReleaseUrl: z.string().nullable(),
    latestReleaseBody: z.string().nullable(),
    latestPublishedAt: z.string().nullable(),
    fetchedAt: z.string().nullable(),
    fetchError: z.string().nullable(),
  })
  .strict();

export type UpdatesState = z.infer<typeof UpdatesStateSchema>;

export const DEFAULT_UPDATES_STATE: UpdatesState = {
  latestVersion: null,
  latestReleaseUrl: null,
  latestReleaseBody: null,
  latestPublishedAt: null,
  fetchedAt: null,
  fetchError: null,
};

export const updatesStateSetting = defineSetting(
  'updates.state',
  UpdatesStateSchema,
  DEFAULT_UPDATES_STATE,
);

export const LastSeenChangelogVersionSchema = z.object({ version: z.string().nullable() }).strict();

export type LastSeenChangelogVersion = z.infer<typeof LastSeenChangelogVersionSchema>;

export const lastSeenChangelogVersionSetting = defineSetting(
  'updates.last_seen_changelog_version',
  LastSeenChangelogVersionSchema,
  { version: null },
);
