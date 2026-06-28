import { test, expect } from '@playwright/test';
import { composeDownUp } from './fixtures/compose';
import { createFirstAdmin, signIn } from './helpers/auth';

test.describe.configure({ timeout: 180_000 });

const ADMIN = { username: 'admin', password: 'hunter22' };
const SECOND = { username: 'mallory', password: 'mallory123' };

// Time-based greeting copy from page-layout.ts greetingFromHour().
const GREETING = /Good morning|Good afternoon|Good evening|Late night/;

// Cache the admin user id discovered in beforeAll (via /api/auth/me).
let adminUserId = 0;

test.beforeAll(async ({ browser }) => {
  composeDownUp();

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await createFirstAdmin(page, ADMIN);
  await signIn(page, ADMIN.username, ADMIN.password);

  // Resolve the admin's user id for the profile-page test.
  const meRes = await page.request.get('/api/auth/me');
  expect(meRes.ok()).toBe(true);
  const me = (await meRes.json()) as { user: { id: number } | null };
  expect(me.user, 'expected an authenticated admin').not.toBeNull();
  adminUserId = me.user!.id;

  // Seed a couple of series so the Recently-added rail has real content and the
  // dashboard has something to render beyond empty states.
  const profilesRes = await page.request.get('/api/quality-profiles');
  expect(profilesRes.ok()).toBe(true);
  const profiles = (await profilesRes.json()) as Array<{ id: number }>;
  expect(profiles.length, 'expected a seeded quality profile').toBeGreaterThan(0);
  const qualityProfileId = profiles[0]!.id;

  const series: Array<Record<string, unknown>> = [
    {
      contentType: 'manga',
      titleEnglish: 'Vinland Saga',
      status: 'releasing',
      rootPath: '/media/manga/Vinland Saga',
      qualityProfileId,
    },
    {
      contentType: 'light_novel',
      titleEnglish: 'Re:Zero Starting Life in Another World',
      anilistId: 98571,
      status: 'releasing',
      rootPath: '/media/light_novel/Re:Zero',
      qualityProfileId,
    },
  ];
  for (const s of series) {
    const res = await page.request.post('/api/series', { data: s });
    expect(res.status(), await res.text()).toBeLessThan(400);
  }

  // Create a second, non-admin user for the per-user-isolation test.
  const created = await page.request.post('/api/users', {
    data: {
      username: SECOND.username,
      password: SECOND.password,
      role: 'user',
      mustChangePassword: false,
    },
  });
  expect(created.ok(), await created.text()).toBe(true);

  await ctx.close();
});

test.describe('Dashboard + Profile', () => {
  test('home (/) routes to /dashboard and sidebar lists Dashboard above Library', async ({
    page,
  }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    await page.goto('/');
    await page.waitForURL((url) => url.pathname === '/dashboard', { timeout: 15_000 });

    const dashboardLink = page.getByRole('link', { name: 'Dashboard', exact: true });
    const libraryLink = page.getByRole('link', { name: 'Library', exact: true });
    await expect(dashboardLink).toBeVisible();
    await expect(libraryLink).toBeVisible();

    // Dashboard nav item is ordered above Library in the sidebar.
    const dashTop = await dashboardLink.evaluate((el) => el.getBoundingClientRect().top);
    const libTop = await libraryLink.evaluate((el) => el.getBoundingClientRect().top);
    expect(dashTop).toBeLessThan(libTop);
  });

  test('dashboard renders greeting, stats range, and widget chrome', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);
    await page.goto('/dashboard');
    await page.waitForURL((url) => url.pathname === '/dashboard');

    // Time-of-day greeting heading.
    await expect(page.getByRole('heading', { level: 1 })).toContainText(GREETING);

    // The "Stats range" control (a radiogroup with aria-label).
    await expect(page.getByRole('radiogroup', { name: 'Stats range' })).toBeVisible();

    // Widget chrome: Continue-reading + Recently-added section headers.
    await expect(page.getByText(/Continue reading/i).first()).toBeVisible();
    await expect(page.getByText(/Recently added/i).first()).toBeVisible();
  });

  test('stats range updates the URL to ?range=month and stays on /dashboard', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);
    await page.goto('/dashboard');
    await page.waitForURL((url) => url.pathname === '/dashboard');

    const group = page.getByRole('radiogroup', { name: 'Stats range' });
    await group.getByRole('radio', { name: 'Month' }).click();

    await page.waitForURL((url) => url.pathname === '/dashboard' && url.search === '?range=month', {
      timeout: 15_000,
    });
    await expect(page.getByRole('radio', { name: 'Month' })).toHaveAttribute('aria-checked', 'true');

    // Switching back to Week clears the param (week is the default → ?range removed).
    await group.getByRole('radio', { name: 'Week' }).click();
    await page.waitForURL((url) => url.pathname === '/dashboard' && url.search === '', {
      timeout: 15_000,
    });
  });

  test('customize drawer toggles a widget off and persists per user', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);
    await page.goto('/dashboard');
    await page.waitForURL((url) => url.pathname === '/dashboard');

    // Recently-added chrome present before we disable it.
    await expect(page.getByText(/Recently added/i).first()).toBeVisible();

    // Open the Customize drawer and toggle "Recently added" off.
    await page.getByRole('button', { name: /Customize/i }).first().click();
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByText(/Customize dashboard/i).first()).toBeVisible();

    const recentSwitch = drawer.getByRole('switch', { name: 'Toggle Recently added' });
    await expect(recentSwitch).toBeChecked();
    await recentSwitch.click();
    await expect(recentSwitch).not.toBeChecked();

    // Done flushes the pending save (PUT /api/dashboard/prefs) + router.refresh().
    await drawer.getByRole('button', { name: 'Done' }).click();

    // The server-side prefs reflect the toggle.
    await expect
      .poll(
        async () => {
          const r = await page.request.get('/api/dashboard/prefs');
          if (!r.ok()) return null;
          const p = (await r.json()) as { enabled: Record<string, boolean> };
          return p.enabled.recent;
        },
        { timeout: 15_000 },
      )
      .toBe(false);

    // A fresh load no longer renders the Recently-added chrome (persisted server-side).
    await page.goto('/dashboard');
    await page.waitForURL((url) => url.pathname === '/dashboard');
    await expect(page.getByText(/Recently added/i)).toHaveCount(0);

    // Restore via the drawer's "Reset to default" so later assertions are unaffected.
    await page.getByRole('button', { name: /Customize/i }).first().click();
    const drawer2 = page.getByRole('dialog');
    await drawer2.getByRole('button', { name: 'Reset to default' }).click();
    await drawer2.getByRole('button', { name: 'Done' }).click();

    await expect
      .poll(
        async () => {
          const r = await page.request.get('/api/dashboard/prefs');
          if (!r.ok()) return null;
          const p = (await r.json()) as { enabled: Record<string, boolean> };
          return p.enabled.recent;
        },
        { timeout: 15_000 },
      )
      .toBe(true);
  });

  test('dashboard prefs are per-user, not global', async ({ page, browser }) => {
    // Admin customizes: turn the "feed" widget off via the API directly so this
    // test is independent of the drawer test's ordering.
    await signIn(page, ADMIN.username, ADMIN.password);
    const cur = await page.request.get('/api/dashboard/prefs');
    expect(cur.ok()).toBe(true);
    const curPrefs = (await cur.json()) as {
      order: string[];
      enabled: Record<string, boolean>;
    };
    const put = await page.request.put('/api/dashboard/prefs', {
      data: { order: curPrefs.order, enabled: { ...curPrefs.enabled, feed: false } },
    });
    expect(put.status(), await put.text()).toBe(200);

    const adminPrefs = await (await page.request.get('/api/dashboard/prefs')).json();
    expect(adminPrefs.enabled.feed).toBe(false);

    // Second user, separate context → their prefs are still the default (feed on).
    const otherCtx = await browser.newContext();
    const otherPage = await otherCtx.newPage();
    await signIn(otherPage, SECOND.username, SECOND.password);
    const otherRes = await otherPage.request.get('/api/dashboard/prefs');
    expect(otherRes.ok()).toBe(true);
    const otherPrefs = (await otherRes.json()) as { enabled: Record<string, boolean> };
    expect(otherPrefs.enabled.feed).toBe(true);
    await otherCtx.close();

    // Restore admin's feed widget so other tests see defaults.
    await page.request.put('/api/dashboard/prefs', {
      data: { order: curPrefs.order, enabled: { ...curPrefs.enabled, feed: true } },
    });
  });

  test('profile page renders the dossier for a real user', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);
    await page.goto(`/profile/${adminUserId}`);
    await page.waitForURL((url) => url.pathname === `/profile/${adminUserId}`);

    // The dossier header carries the member name as the page h1.
    await expect(page.getByRole('heading', { level: 1 })).toContainText(new RegExp(ADMIN.username, 'i'));

    // The 4-stat strip — assert a couple of StatTile labels are present.
    await expect(page.getByText(/Total time/i).first()).toBeVisible();
    await expect(page.getByText(/Finished/i).first()).toBeVisible();

    // Back-to-dashboard affordance.
    await expect(page.getByRole('link', { name: /Dashboard/i }).first()).toBeVisible();
  });

  test('profile page renders the not-found UI for an unknown user id', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);
    await page.goto('/profile/999999');
    // The page calls notFound() for an unknown id. On a force-dynamic route Next
    // streams the shell first, so the HTTP status is 200 even though the default
    // 404 UI renders — assert the visible not-found content (cf. 34-not-found).
    const body = await page.locator('body').textContent();
    expect(body?.toLowerCase()).toMatch(/404|not found|could not be found/i);
  });

  test('reader goals API round-trips a PUT then GET', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    const put = await page.request.put('/api/reader/goals', {
      data: { yearlyBooks: 24, weeklyMinutes: 150 },
    });
    expect(put.status(), await put.text()).toBe(200);

    const get = await page.request.get('/api/reader/goals');
    expect(get.ok()).toBe(true);
    const goals = (await get.json()) as { yearlyBooks: number | null; weeklyMinutes: number | null };
    expect(goals.yearlyBooks).toBe(24);
    expect(goals.weeklyMinutes).toBe(150);
  });
});
