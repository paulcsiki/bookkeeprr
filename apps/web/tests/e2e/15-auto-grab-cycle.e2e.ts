/**
 * Auto-grab cycle e2e (Spec 4).
 *
 * Goal: prove that enabling auto-grab + triggering an indexer poll results in
 * a release being automatically grabbed and a download enqueued.
 *
 * Current status: PARTIALLY SKIPPED.
 *
 * The full cycle requires triggering the `indexer_poll_fanout` → `indexer_poll`
 * job chain from a test. The `/api/jobs/run` admin endpoint only exposes
 * a fixed RUNNABLE list: { qbt_watch, import, library_scan, housekeeping }.
 * Neither `indexer_poll_fanout` nor `indexer_poll` are in that list, so there
 * is no admin HTTP trigger for a full poll cycle.
 *
 * KNOWN LIMITATION: Add `indexer_poll_fanout` (selfEnqueue: true) to the RUNNABLE
 * map in `apps/web/src/app/api/jobs/run/route.ts` to unlock the end-to-end test
 * below. Until then, this file proves the auto-grab *settings* round-trip (GET +
 * PATCH) and leaves the full cycle test as an annotated skip.
 */

import { test, expect } from '@playwright/test';
import { composeDownUp } from './fixtures/compose';
import { createFirstAdmin, signIn } from './helpers/auth';

test.describe.configure({ timeout: 180_000 });

const ADMIN = { username: 'admin', password: 'hunter22' };

// qBittorrent in the e2e docker-compose network.
const QBT = {
  host: 'qbittorrent',
  port: 8080,
  username: 'admin',
  password: 'adminadmin',
  useHttps: false,
} as const;

test.beforeAll(async ({ browser }) => {
  composeDownUp();

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await createFirstAdmin(page, ADMIN);
  await ctx.close();
});

test.describe('Auto-grab cycle', () => {
  test('auto-grab settings GET + PATCH round-trip', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    // Verify the defaults.
    const getRes = await page.request.get('/api/settings/auto-grab');
    expect(getRes.ok(), await getRes.text()).toBe(true);
    const defaults = (await getRes.json()) as { dryRun: boolean };
    expect(typeof defaults.dryRun).toBe('boolean');

    // Enable dry-run to confirm PATCH works.
    const patchRes = await page.request.patch('/api/settings/auto-grab', {
      data: { dryRun: true },
    });
    expect(patchRes.ok(), await patchRes.text()).toBe(true);

    const getAfter = await page.request.get('/api/settings/auto-grab');
    const after = (await getAfter.json()) as { dryRun: boolean };
    expect(after.dryRun).toBe(true);

    // Reset to non-dry-run.
    await page.request.patch('/api/settings/auto-grab', { data: { dryRun: false } });
  });

  /**
   * Full cycle: enable auto-grab → trigger indexer poll → verify grab enqueued.
   *
   * SKIPPED: `/api/jobs/run` does not include `indexer_poll_fanout` in its
   * RUNNABLE list so there is no admin HTTP trigger for a full poll cycle.
   * To unblock, add:
   *   indexer_poll_fanout: { descriptor: indexerPollFanoutDescriptor, selfEnqueue: true }
   * to RUNNABLE in `apps/web/src/app/api/jobs/run/route.ts`.
   */
  test.skip('enable auto-grab → cron fires → release auto-grabbed → download appears in qBit', async ({
    page,
  }) => {
    console.warn(
      'auto-grab cycle test SKIPPED — needs admin trigger for indexer_poll_fanout job kind; ' +
        'current /api/jobs/run RUNNABLE list does not include it.',
    );

    await signIn(page, ADMIN.username, ADMIN.password);

    // 0. Persist qBittorrent connection.
    const qbtRes = await page.request.put('/api/settings/qbt', { data: QBT });
    expect(qbtRes.ok()).toBe(true);

    // 1. Register the mock-nyaa indexer (same as 11-acquisition-pipeline).
    const idxRes = await page.request.post('/api/indexers', {
      data: {
        name: 'Mock Nyaa',
        kind: 'nyaa',
        enabled: true,
        priority: 10,
        config: {
          baseUrl: 'http://mock-nyaa:3001',
          queryTemplate: '{title}',
          contentTypes: ['manga'],
          categoryByContentType: { manga: '3_1' },
          pollIntervalSeconds: 60,
        },
      },
    });
    expect(idxRes.status()).toBeLessThan(400);

    // 2. Fetch a quality profile.
    const profilesRes = await page.request.get('/api/quality-profiles');
    const profiles = (await profilesRes.json()) as Array<{ id: number }>;
    const qualityProfileId = profiles[0]!.id;

    // 3. Create a matching series.
    const seriesRes = await page.request.post('/api/series', {
      data: {
        contentType: 'manga',
        titleEnglish: 'Mock Test Series',
        titleRomaji: 'Mock Test Series',
        status: 'releasing',
        rootPath: '/media/manga',
        qualityProfileId,
      },
    });
    expect(seriesRes.status()).toBeLessThan(400);
    const series = (await seriesRes.json()) as { id: number };

    // 4. Enable auto-grab (non-dry-run).
    await page.request.patch('/api/settings/auto-grab', { data: { dryRun: false } });

    // 5. Trigger indexer_poll_fanout via /api/jobs/run.
    //    This will 400 until the kind is added to RUNNABLE.
    const runRes = await page.request.post('/api/jobs/run', {
      data: { kind: 'indexer_poll_fanout' },
    });
    expect(runRes.ok(), await runRes.text()).toBe(true);

    // 6. Verify a download was enqueued.
    const downloadsRes = await page.request.get('/api/downloads');
    expect(downloadsRes.ok()).toBe(true);
    const downloads = (await downloadsRes.json()) as Array<{ seriesId: number }>;
    const grabbed = downloads.some((d) => d.seriesId === series.id);
    expect(grabbed, 'expected a download row for the auto-grabbed series').toBe(true);
  });
});
