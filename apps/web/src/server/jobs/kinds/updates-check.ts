import { z } from 'zod';
import type { JobKindDescriptor } from '@/server/jobs/types';
import { DEFAULT_RETRY_POLICY, DEFAULT_TIMEOUT_MS } from '@/server/jobs/types';
import { logger } from '@/server/logger';
import { BUILD_INFO } from '@/server/build-info';
import { fetchReleases, GitHubError } from '@/server/integrations/github/client';
import { compareSemver } from '@/server/util/semver';
import {
  updatesConfigSetting,
  updatesStateSetting,
  type UpdatesState,
} from '@/server/db/settings/updates';
import { notify } from '@/server/notifications';

const Payload = z.object({}).strict();

export type UpdatesCheckResult = {
  latestVersion: string | null;
  changed: boolean;
};

export const updatesCheckDescriptor: JobKindDescriptor<
  Record<string, never>,
  UpdatesCheckResult
> = {
  kind: 'updates_check',
  retryPolicy: { ...DEFAULT_RETRY_POLICY, maxAttempts: 1 },
  timeoutMs: DEFAULT_TIMEOUT_MS,
  handler: async (raw) => {
    const log = logger().child({ component: 'updates_check' });
    Payload.parse(raw);

    const cfg = await updatesConfigSetting.get();
    if (cfg.frequency === 'off') {
      log.info('updates check disabled (frequency=off); skipping');
      return { latestVersion: null, changed: false };
    }

    const prior = await updatesStateSetting.get();
    const now = new Date().toISOString();

    // Frequency gate: skip if last check is too recent.
    if (prior.fetchedAt !== null) {
      const msSinceLast = Date.now() - new Date(prior.fetchedAt).getTime();
      const minIntervalMs: Record<'hourly' | 'daily' | 'weekly' | 'off', number> = {
        hourly: 60 * 60 * 1000,
        daily: 24 * 60 * 60 * 1000,
        weekly: 7 * 24 * 60 * 60 * 1000,
        off: Infinity,
      };
      if (msSinceLast < minIntervalMs[cfg.frequency]) {
        log.info(
          { frequency: cfg.frequency, msSinceLast },
          'updates check: too recent; skipping',
        );
        return { latestVersion: prior.latestVersion, changed: false };
      }
    }

    let releases;
    try {
      releases = await fetchReleases(10);
    } catch (err) {
      const message = err instanceof GitHubError ? `${err.code}: ${err.message}` : String(err);
      log.warn({ err: message }, 'updates check: fetch failed');
      const next: UpdatesState = { ...prior, fetchedAt: now, fetchError: message };
      await updatesStateSetting.set(next);
      return { latestVersion: prior.latestVersion, changed: false };
    }

    const stable = releases.filter((r) => !r.prerelease);
    const top = stable[0];
    if (!top) {
      log.info('no stable releases yet');
      await updatesStateSetting.set({ ...prior, fetchedAt: now, fetchError: null });
      return { latestVersion: null, changed: false };
    }

    const next: UpdatesState = {
      latestVersion: top.tagName,
      latestReleaseUrl: top.htmlUrl,
      latestReleaseBody: top.body,
      latestPublishedAt: top.publishedAt,
      fetchedAt: now,
      fetchError: null,
    };
    await updatesStateSetting.set(next);

    const isNewer = compareSemver(top.tagName, `v${BUILD_INFO.version}`) > 0;
    const changed = isNewer && prior.latestVersion !== top.tagName;
    if (changed && cfg.notifyOnIntegrations) {
      await notify({
        kind: 'update-available',
        currentVersion: `v${BUILD_INFO.version}`,
        latestVersion: top.tagName,
        releaseUrl: top.htmlUrl,
      });
    }
    return { latestVersion: top.tagName, changed };
  },
};
