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

test.describe('Reader stats API', () => {
  test('GET /api/reader/stats returns the canonical stats envelope on a fresh install', async ({
    page,
  }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    const res = await page.request.get('/api/reader/stats');
    expect(res.ok(), `GET /api/reader/stats failed: ${await res.text()}`).toBe(true);

    const body = (await res.json()) as {
      days: Array<{ day: string; secondsRead: number; unitsRead: number }>;
      totalSeconds: number;
      totalUnits: number;
      streak: number;
      pacePerHour: number | null;
    };

    expect(Array.isArray(body.days)).toBe(true);
    expect(body.days.length).toBe(7);
    expect(typeof body.totalSeconds).toBe('number');
    expect(typeof body.totalUnits).toBe('number');
    expect(typeof body.streak).toBe('number');
    // Fresh install: no reading recorded.
    expect(body.totalSeconds).toBe(0);
    expect(body.totalUnits).toBe(0);
    expect(body.streak).toBe(0);
    // pacePerHour is null when totalSeconds is 0.
    expect(body.pacePerHour).toBeNull();

    // Each day entry has the required shape.
    for (const d of body.days) {
      expect(typeof d.day).toBe('string');
      expect(typeof d.secondsRead).toBe('number');
      expect(typeof d.unitsRead).toBe('number');
    }
  });

  test('POST /api/reader/stats/heartbeat accepts a tick payload and returns ok', async ({
    page,
  }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    const res = await page.request.post('/api/reader/stats/heartbeat', {
      data: { seconds: 30, units: 2 },
    });
    expect(res.status(), `heartbeat POST failed: ${await res.text()}`).toBe(200);

    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  test('POST /api/reader/stats/heartbeat rejects a payload missing seconds', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    const res = await page.request.post('/api/reader/stats/heartbeat', {
      data: { units: 5 },
    });
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBeDefined();
  });

  test('GET /api/reader/stats/pace returns null metrics on a fresh install', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    const res = await page.request.get('/api/reader/stats/pace');
    expect(res.ok(), `GET /api/reader/stats/pace failed: ${await res.text()}`).toBe(true);

    const body = (await res.json()) as {
      pagesPerDay: number | null;
      secondsPerDay: number | null;
      days: number;
    };

    expect(typeof body.days).toBe('number');
    // Fresh install has fewer than 3 active days — metrics are null.
    expect(body.pagesPerDay).toBeNull();
    expect(body.secondsPerDay).toBeNull();
  });

  test('POST heartbeat then GET /api/reader/stats reflects the recorded seconds', async ({
    page,
  }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    // Record 60 seconds of reading.
    const post = await page.request.post('/api/reader/stats/heartbeat', {
      data: { seconds: 60, units: 3 },
    });
    expect(post.ok(), `heartbeat POST failed: ${await post.text()}`).toBe(true);

    // The weekly stats should now report > 0 total seconds.
    const res = await page.request.get('/api/reader/stats');
    expect(res.ok(), `GET /api/reader/stats failed: ${await res.text()}`).toBe(true);

    const body = (await res.json()) as {
      totalSeconds: number;
      totalUnits: number;
      pacePerHour: number | null;
    };
    expect(body.totalSeconds).toBeGreaterThan(0);
    expect(body.totalUnits).toBeGreaterThan(0);
    // pacePerHour is now a number because totalSeconds > 0.
    expect(typeof body.pacePerHour).toBe('number');
  });
});
