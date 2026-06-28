/**
 * Library scan e2e (Spec 21).
 *
 * Goal: cover the library scan trigger endpoint and settings page.
 *
 * The scan flow:
 *   POST /api/scan { rootPath } — enqueues a library_scan job (async, returns
 *   { jobId }).  The path must be readable by the server process.  In the e2e
 *   Docker environment /tmp is always readable.
 *
 * Note: /api/jobs/run with kind:'library_scan' has selfEnqueue:false so it
 * only drains already-pending jobs; it does NOT trigger a fresh scan. The
 * correct admin trigger for "start a scan now" is POST /api/scan.
 *
 * Route:  POST /api/scan
 *         GET  /settings/library/scan (page render)
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

test.describe('Library scan', () => {
  test('POST /api/scan with a readable rootPath enqueues a scan job', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    // /tmp is guaranteed to be readable inside the Docker container.
    const r = await page.request.post('/api/scan', {
      data: { rootPath: '/tmp' },
    });
    // Expect 202 Accepted (job enqueued) or 409 if a scan is already in progress.
    expect([202, 409], `unexpected status: ${r.status()}`).toContain(r.status());

    if (r.status() === 202) {
      const body = (await r.json()) as { jobId: number };
      expect(typeof body.jobId).toBe('number');
      expect(body.jobId).toBeGreaterThan(0);
    }
  });

  test('POST /api/scan with an unreadable path returns 400', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    const r = await page.request.post('/api/scan', {
      data: { rootPath: '/this-path-does-not-exist-at-all' },
    });
    expect(r.status()).toBe(400);
    const body = (await r.json()) as { error: string };
    expect(body.error).toMatch(/rootPath not readable/i);
  });

  test('/settings/library/scan page renders for admin', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);
    await page.goto('/settings/library/scan');
    await expect(page).toHaveURL(/\/settings\/library\/scan/);
    await expect(page.getByRole('heading', { name: /Library scan/i })).toBeVisible();
  });
});
