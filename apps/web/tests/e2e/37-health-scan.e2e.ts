/**
 * Library health-scan e2e (Spec 37).
 *
 * POST /api/library/health-scan (admin-only) enqueues a `library_health_scan`
 * job (202 + { jobId }; 409 + { existingJobId } when one is already
 * pending/running). The background worker's minute-cadence drain entry
 * (scheduler.ts: libraryHealthScanDrainEntry) picks the job up, so the spec
 * polls GET /api/jobs/<id> until the job completes, then asserts the
 * LibraryHealthScanResult shape from result_json.
 *
 * The library is seeded with the known-good reader fixtures (sample.cbz /
 * sample.epub / sample.mp3), so the scan must find nothing bad and delete
 * nothing — the owned volume stays owned afterwards.
 */

import { test, expect } from '@playwright/test';
import { composeDownUp } from './fixtures/compose';
import { createFirstAdmin, signIn } from './helpers/auth';
import { seedReaderFixtures, type ReaderSeed } from './helpers/reader-seed';

test.describe.configure({ timeout: 180_000 });

const ADMIN = { username: 'admin', password: 'hunter22' };

let seed: ReaderSeed;

test.beforeAll(async ({ browser }) => {
  composeDownUp();

  // First-run admin initialises the DB + a default quality profile, which the
  // raw-SQL reader seed depends on. Do it before seeding.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await createFirstAdmin(page, ADMIN);
  await ctx.close();

  seed = seedReaderFixtures();
});

test.describe('Library health scan', () => {
  test('unauthenticated POST /api/library/health-scan returns 401', async ({ request }) => {
    // The bare `request` fixture carries no session cookie.
    const res = await request.post('/api/library/health-scan');
    expect(res.status()).toBe(401);
  });

  test('non-admin POST /api/library/health-scan returns 403', async ({ page }) => {
    // Admin creates a regular user…
    await signIn(page, ADMIN.username, ADMIN.password);
    const created = await page.request.post('/api/users', {
      data: { username: 'scanbob', password: 'scanbobpwd1', role: 'user' },
    });
    expect(created.status(), await created.text()).toBeLessThan(400);

    // …who is authenticated but not an admin → 403 (NOT 401, which would make
    // the mobile client sign out).
    await signIn(page, 'scanbob', 'scanbobpwd1');
    const res = await page.request.post('/api/library/health-scan');
    expect(res.status()).toBe(403);
  });

  test('admin POST enqueues the job; result reports only-good files untouched', async ({
    page,
  }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    const res = await page.request.post('/api/library/health-scan');
    // 202 = enqueued; 409 = a scan is already pending/running (e.g. the weekly
    // auto-enqueue fired) — either way we get a job id to poll.
    expect([202, 409], `unexpected status: ${res.status()}`).toContain(res.status());
    const resBody = (await res.json()) as { jobId?: number; existingJobId?: number };
    const jobId = res.status() === 202 ? resBody.jobId : resBody.existingJobId;
    expect(typeof jobId).toBe('number');
    expect(jobId!).toBeGreaterThan(0);

    // The worker's drain entry runs on a minute cron — poll the job row until
    // it completes (allow a comfortable margin past one tick).
    const deadline = Date.now() + 150_000;
    let job: { status: string; resultJson: string | null; error: string | null } | null = null;
    while (Date.now() < deadline) {
      const jr = await page.request.get(`/api/jobs/${jobId}`);
      expect(jr.ok(), await jr.text()).toBe(true);
      job = (await jr.json()) as { status: string; resultJson: string | null; error: string | null };
      if (job.status === 'completed' || job.status === 'failed') break;
      await page.waitForTimeout(2_000);
    }
    expect(job, 'job row should have been fetched').not.toBeNull();
    expect(job!.status, `job did not complete (error: ${job!.error ?? 'none'})`).toBe('completed');

    // LibraryHealthScanResult shape (src/server/jobs/kinds/library-health-scan.ts).
    expect(job!.resultJson, 'completed job must carry a result').not.toBeNull();
    const result = JSON.parse(job!.resultJson!) as {
      scanned: number;
      bad: number;
      deleted: number;
      inconclusive: number;
      seriesRequeued: number;
      errors: string[];
    };
    expect(typeof result.scanned).toBe('number');
    expect(typeof result.bad).toBe('number');
    expect(typeof result.deleted).toBe('number');
    expect(typeof result.inconclusive).toBe('number');
    expect(typeof result.seriesRequeued).toBe('number');
    expect(Array.isArray(result.errors)).toBe(true);

    // The three seeded readables were all opened…
    expect(result.scanned).toBeGreaterThanOrEqual(3);
    // …and, being valid fixtures, none was flagged or destroyed.
    expect(result.bad).toBe(0);
    expect(result.deleted).toBe(0);
    expect(result.seriesRequeued).toBe(0);
    expect(result.errors).toEqual([]);

    // The comic's library file survived: its volume still reports as owned
    // ('imported') in the series detail envelope.
    const sr = await page.request.get(`/api/series/${seed.comic.seriesId}`);
    expect(sr.ok(), await sr.text()).toBe(true);
    const series = (await sr.json()) as {
      volumesList: Array<{ id: number; status: 'imported' | 'wanted' }>;
    };
    const vol = series.volumesList.find((v) => v.id === seed.comic.volumeId);
    expect(vol, 'seeded comic volume should still exist').toBeDefined();
    expect(vol!.status).toBe('imported');
  });
});
