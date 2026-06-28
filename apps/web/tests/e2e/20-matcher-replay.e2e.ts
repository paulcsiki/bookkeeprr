/**
 * Matcher replay e2e (Spec 20).
 *
 * Goal: cover the matcher replay trigger endpoint.
 *
 * The replay runs asynchronously: POST /api/settings/matcher/replays enqueues
 * a `release_match_replay` job and returns { runId }. The `release_match_replay`
 * kind is NOT in the /api/jobs/run RUNNABLE list so it cannot be driven to
 * completion synchronously from a test. The test below verifies:
 *   - The POST returns 200 with a numeric runId.
 *   - GET /api/settings/matcher/replays lists the enqueued run.
 *   - GET /api/settings/matcher/replays/:runId returns the run record.
 *   - A non-admin cannot trigger a replay (403).
 *
 * NOTE: Full end-to-end replay execution (status → completed, diffs populated)
 * cannot be driven from the test because `release_match_replay` is not in
 * RUNNABLE. To unlock: add it to RUNNABLE in
 * `apps/web/src/app/api/jobs/run/route.ts` with selfEnqueue: false.
 *
 * Route:  POST   /api/settings/matcher/replays
 *         GET    /api/settings/matcher/replays
 *         GET    /api/settings/matcher/replays/:runId
 */

import { test, expect } from '@playwright/test';
import { composeDownUp } from './fixtures/compose';
import { createFirstAdmin, signIn } from './helpers/auth';

test.describe.configure({ timeout: 180_000 });

const ADMIN = { username: 'admin', password: 'hunter22' };

test.beforeAll(async ({ browser }) => {
  composeDownUp();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await createFirstAdmin(page, ADMIN);
  await ctx.close();
});

test.describe('Matcher replay', () => {
  test('POST /api/settings/matcher/replays enqueues a run and lists it', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    // Trigger a replay with no window (all-time) and no specific series.
    const post = await page.request.post('/api/settings/matcher/replays', {
      data: { windowDays: null },
    });
    expect(post.ok(), await post.text()).toBe(true);
    const postBody = (await post.json()) as { runId: number };
    expect(typeof postBody.runId).toBe('number');
    expect(postBody.runId).toBeGreaterThan(0);

    const runId = postBody.runId;

    // List endpoint should include the new run.
    const list = await page.request.get('/api/settings/matcher/replays');
    expect(list.ok(), await list.text()).toBe(true);
    const listBody = (await list.json()) as { runs: Array<{ id: number }> };
    expect(listBody.runs.some((r) => r.id === runId)).toBe(true);

    // Detail endpoint should return the run record.
    const detail = await page.request.get(`/api/settings/matcher/replays/${runId}`);
    expect(detail.ok(), await detail.text()).toBe(true);
    const detailBody = (await detail.json()) as {
      run: { id: number; status: string };
      rows: unknown[];
      total: number;
    };
    expect(detailBody.run.id).toBe(runId);
    // matchReplayRuns.status enum (schema.ts:482) is 'running' | 'completed' | 'failed'.
    expect(['running', 'completed', 'failed']).toContain(detailBody.run.status);
    expect(detailBody.total).toBe(0); // no series data → 0 diffs
  });

  test('Non-admin cannot trigger a replay (403)', async ({ browser, page }) => {
    // Create a regular user via the admin session.
    await signIn(page, ADMIN.username, ADMIN.password);
    const create = await page.request.post('/api/users', {
      data: { username: 'bob', password: 'hunter22', role: 'user', mustChangePassword: false },
    });
    expect(create.ok()).toBe(true);

    const bobCtx = await browser.newContext();
    const bobPage = await bobCtx.newPage();
    await signIn(bobPage, 'bob', 'hunter22');

    const r = await bobPage.request.post('/api/settings/matcher/replays', {
      data: { windowDays: 30 },
    });
    expect(r.status()).toBe(403);

    await bobCtx.close();
  });
});
