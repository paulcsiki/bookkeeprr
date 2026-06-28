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

test.describe('Add series', () => {
  test('/add redirects to the library (adding is driven from Discover)', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);
    await page.goto('/add');

    // The standalone /add chooser was retired; /add now redirects to /library
    // and series are added from Discover (see 16-discover / 24-discover-search).
    await page.waitForURL((url) => url.pathname === '/library', { timeout: 15_000 });
    await expect(page).toHaveURL(/\/library$/);
  });

  test('POST /api/series creates a series visible in /library', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    // Fetch the first quality profile (seeded by first-run).
    const profilesRes = await page.request.get('/api/quality-profiles');
    expect(profilesRes.ok()).toBe(true);
    const profiles = (await profilesRes.json()) as Array<{ id: number }>;
    expect(profiles.length, 'expected a seeded quality profile').toBeGreaterThan(0);
    const qualityProfileId = profiles[0]!.id;

    // POST a new series via the API (mirrors the library-seed pattern from 12-library).
    // This is the API-driven add flow — no AniList / ComicVine calls needed.
    const postRes = await page.request.post('/api/series', {
      data: {
        contentType: 'manga',
        titleEnglish: 'Chainsaw Man',
        status: 'releasing',
        rootPath: '/media/manga/Chainsaw Man',
        qualityProfileId,
      },
    });
    expect(postRes.status(), await postRes.text()).toBeLessThan(400);
    const created = (await postRes.json()) as { id: number };
    expect(created.id).toBeGreaterThan(0);

    // Confirm the series appears in the GET /api/series list.
    const listRes = await page.request.get('/api/series');
    expect(listRes.ok()).toBe(true);
    const listBody = (await listRes.json()) as { rows: Array<{ titleEnglish: string | null }> };
    expect(listBody.rows.some((r) => r.titleEnglish === 'Chainsaw Man')).toBe(true);

    // Navigate to /library and confirm the series card is visible. Assert by the
    // stable /library/<id> card link (a coverless card renders its title twice →
    // getByText strict-mode violation).
    await page.goto('/library');
    await expect(page.locator(`a[href="/library/${created.id}"]`).first()).toBeVisible();
  });
});
