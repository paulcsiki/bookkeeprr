import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { updatesCheckDescriptor } from '@/server/jobs/kinds/updates-check';
import { updatesConfigSetting, updatesStateSetting } from '@/server/db/settings/updates';
import * as ghClient from '@/server/integrations/github/client';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await h.cleanup();
});

describe('updates_check job kind', () => {
  it('writes state on successful fetch with a newer version', async () => {
    vi.spyOn(ghClient, 'fetchReleases').mockResolvedValueOnce([
      {
        tagName: 'v99.0.0',
        name: 'v99.0.0',
        body: 'big release',
        htmlUrl: 'https://github.com/x/y/releases/tag/v99.0.0',
        publishedAt: '2026-05-20T12:00:00Z',
        prerelease: false,
        draft: false,
      },
    ]);
    await updatesCheckDescriptor.handler({}, 1);
    const state = await updatesStateSetting.get();
    expect(state.latestVersion).toBe('v99.0.0');
    expect(state.fetchError).toBeNull();
  });

  it('does nothing when frequency=off', async () => {
    await updatesConfigSetting.set({
      frequency: 'off',
      behavior: 'notify',
      notifyOnIntegrations: false,
      showChangelogOnFirstLaunch: true,
    });
    const before = await updatesStateSetting.get();
    await updatesCheckDescriptor.handler({}, 1);
    const after = await updatesStateSetting.get();
    expect(after).toEqual(before);
  });

  it('preserves prior latestVersion on fetch failure', async () => {
    await updatesStateSetting.set({
      latestVersion: 'v0.5.0',
      latestReleaseUrl: 'url',
      latestReleaseBody: null,
      latestPublishedAt: null,
      fetchedAt: '2026-05-19T00:00:00Z',
      fetchError: null,
    });
    vi.spyOn(ghClient, 'fetchReleases').mockRejectedValueOnce(
      new ghClient.GitHubError('rate-limited', 'reset at 1700000000'),
    );
    await updatesCheckDescriptor.handler({}, 1);
    const state = await updatesStateSetting.get();
    expect(state.latestVersion).toBe('v0.5.0');
    expect(state.fetchError).toMatch(/rate-limited/);
  });

  it('skips when daily and last check was 30 minutes ago', async () => {
    // Set fetchedAt to 30 minutes ago
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    await updatesStateSetting.set({
      latestVersion: 'v1.0.0',
      latestReleaseUrl: null,
      latestReleaseBody: null,
      latestPublishedAt: null,
      fetchedAt: thirtyMinsAgo,
      fetchError: null,
    });
    await updatesConfigSetting.set({
      frequency: 'daily',
      behavior: 'notify',
      notifyOnIntegrations: false,
      showChangelogOnFirstLaunch: true,
    });
    const fetchSpy = vi.spyOn(ghClient, 'fetchReleases');
    const result = await updatesCheckDescriptor.handler({}, 1);
    // Should not have called fetchReleases
    expect(fetchSpy).not.toHaveBeenCalled();
    // Should return prior state
    expect(result.latestVersion).toBe('v1.0.0');
    expect(result.changed).toBe(false);
  });

  it('runs when daily and last check was 25 hours ago', async () => {
    // Set fetchedAt to 25 hours ago (beyond daily window)
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    await updatesStateSetting.set({
      latestVersion: null,
      latestReleaseUrl: null,
      latestReleaseBody: null,
      latestPublishedAt: null,
      fetchedAt: twentyFiveHoursAgo,
      fetchError: null,
    });
    await updatesConfigSetting.set({
      frequency: 'daily',
      behavior: 'notify',
      notifyOnIntegrations: false,
      showChangelogOnFirstLaunch: true,
    });
    vi.spyOn(ghClient, 'fetchReleases').mockResolvedValueOnce([
      {
        tagName: 'v99.0.0',
        name: null,
        body: null,
        htmlUrl: 'x',
        publishedAt: null,
        prerelease: false,
        draft: false,
      },
    ]);
    await updatesCheckDescriptor.handler({}, 1);
    const state = await updatesStateSetting.get();
    expect(state.latestVersion).toBe('v99.0.0');
  });

  it('filters out prereleases', async () => {
    vi.spyOn(ghClient, 'fetchReleases').mockResolvedValueOnce([
      {
        tagName: 'v99.0.0-rc.1',
        name: null,
        body: null,
        htmlUrl: 'x',
        publishedAt: null,
        prerelease: true,
        draft: false,
      },
      {
        tagName: 'v50.0.0',
        name: null,
        body: null,
        htmlUrl: 'x',
        publishedAt: null,
        prerelease: false,
        draft: false,
      },
    ]);
    await updatesCheckDescriptor.handler({}, 1);
    const state = await updatesStateSetting.get();
    expect(state.latestVersion).toBe('v50.0.0');
  });
});
