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
  // Sign in to seed the series.
  await signIn(page, ADMIN.username, ADMIN.password);

  // Fetch the first quality profile (seeded by first-run).
  const profilesRes = await page.request.get('/api/quality-profiles');
  expect(profilesRes.ok()).toBe(true);
  const profiles = (await profilesRes.json()) as Array<{ id: number }>;
  expect(profiles.length, 'expected a seeded quality profile').toBeGreaterThan(0);
  const qualityProfileId = profiles[0]!.id;

  // Seed 3 series: 2 manga, 1 light novel.
  const series: Array<Record<string, unknown>> = [
    {
      contentType: 'manga',
      titleEnglish: 'Vinland Saga',
      status: 'releasing',
      rootPath: '/media/manga/Vinland Saga',
      qualityProfileId,
    },
    {
      contentType: 'manga',
      titleEnglish: 'Berserk',
      status: 'releasing',
      rootPath: '/media/manga/Berserk',
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

  await ctx.close();
});

test.describe('Library page', () => {
  // Assert presence by the stable /library/<id> card link rather than title
  // text: a series card with no cover renders its title twice (cover fallback +
  // meta), so getByText() hits a strict-mode violation, and the metadata-hydrate
  // cron can rewrite the displayed title between beforeAll and the test. Seed
  // order → ids: 1 Vinland Saga (manga), 2 Berserk (manga), 3 Re:Zero (novel).
  const card = (id: number) =>
    `a[href="/library/${id}"], a[href^="/library/${id}?"], a[href^="/library/${id}/"]`;

  test('library page renders all seeded series', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);
    await page.goto('/library');

    await expect(page.locator(card(1)).first()).toBeVisible();
    await expect(page.locator(card(2)).first()).toBeVisible();
    await expect(page.locator(card(3)).first()).toBeVisible();
  });

  test('search input filters by title', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);
    await page.goto('/library');

    // The search input has aria-label="Search the library".
    const searchInput = page.getByRole('searchbox', { name: /search the library/i });
    await searchInput.fill('Vinland');

    await expect(page.locator(card(1)).first()).toBeVisible();
    await expect(page.locator(card(2))).toHaveCount(0);
    await expect(page.locator(card(3))).toHaveCount(0);
  });

  test('content-type filter chip narrows to manga', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);
    await page.goto('/library');

    // ContentTypeFilter renders filter buttons with text "<Label><count>" (e.g. "Manga 2").
    // The accessible name therefore starts with "Manga " — anchor the regex to avoid
    // matching the ContentTypePill on each series card.
    await page.getByRole('button', { name: /^Manga\s/ }).click();

    await expect(page.locator(card(1)).first()).toBeVisible();
    await expect(page.locator(card(2)).first()).toBeVisible();
    await expect(page.locator(card(3))).toHaveCount(0);
  });

  test('library renders in list view', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    // Pre-set the view preference via addInitScript so LibraryView hydrates in list mode.
    await page.addInitScript(() => {
      localStorage.setItem('bookkeeprr.library.view', JSON.stringify('list'));
    });

    await page.goto('/library');

    // The list-table container should be present (SeriesList renders .list-table).
    await expect(page.locator('.list-table')).toBeVisible();

    // All three seeded series must still be visible in list mode. Assert by
    // /library/<id> link rather than title text — the worker's metadata-hydrate
    // cron can rewrite the displayed title (e.g. AniList false-matches a
    // "Re:Zero" seed to "Suki yori mo Chikaku") between beforeAll and this
    // test. The link href is stable; the title is not.
    await expect(page.locator('a[href="/library/1"]')).toBeVisible();
    await expect(page.locator('a[href="/library/2"]')).toBeVisible();
    await expect(page.locator('a[href="/library/3"]')).toBeVisible();

    // The list view tab should be pressed/active.
    await expect(page.getByRole('button', { name: 'List view' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
