/**
 * Book-series e2e (web UI, Tasks 9-13).
 *
 * One serial flow against a fresh compose instance:
 *   1. Library collapse  — 2 ebook series assigned to the same book series
 *      collapse into a single `book-series-card-*` showing the series name
 *      and a "SERIES · 2 BOOKS" count; no standalone cards for the members.
 *   2. Series page — click the card → /library/series/<id>; page renders
 *      `book-series-page` with the member books via `owned-book-<seriesId>`.
 *   3. Part-of-series — open one member title's detail; `part-of-series-card`
 *      present and its View button navigates to /library/series/<id>.
 *   4. Search — type a member title's name in the library search; the book-
 *      series card surfaces (not hidden), showing the `matchedTitle` label.
 *
 * Seed approach: mirrors 39-library-groups.e2e.ts — series seeded via
 * POST /api/series in beforeAll; book series created via POST /api/book-series;
 * member assignments via POST /api/book-series/{id}/members.
 *
 * Missing-book assertion: deferred. Seeding a genuine missing entry requires
 * the refresh/detection path or injecting an externalRef entry directly into
 * the DB — neither is available through the public API. Focus here is on
 * owned-member flows which are fully seedable via the admin API.
 *
 * Server surface under test: /api/book-series CRUD,
 * /api/book-series/{id}/members. UI tasks 11 (library card), 12 (series page),
 * 13 (part-of-series card).
 */

import { test, expect } from '@playwright/test';
import { composeDownUp } from './fixtures/compose';
import { createFirstAdmin, signIn } from './helpers/auth';

// Stateful flow — later tests depend on earlier ones.
test.describe.configure({ mode: 'serial', timeout: 180_000 });

const ADMIN = { username: 'admin', password: 'hunter22' };

// Resolved in beforeAll; shared across serial tests via module-level state.
let bookSeriesId = 0;
let memberSeriesId1 = 0;
let memberSeriesId2 = 0;

test.beforeAll(async ({ browser }) => {
  composeDownUp();

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await createFirstAdmin(page, ADMIN);
  await signIn(page, ADMIN.username, ADMIN.password);

  // Fetch the default quality profile (created during first-run).
  const profilesRes = await page.request.get('/api/quality-profiles');
  expect(profilesRes.ok(), await profilesRes.text()).toBe(true);
  const profiles = (await profilesRes.json()) as Array<{ id: number }>;
  expect(profiles.length, 'expected at least one seeded quality profile').toBeGreaterThan(0);
  const qualityProfileId = profiles[0]!.id;

  // Seed 2 ebook series (the book-series feature applies to ebook and audiobook
  // content types, per the BookSeriesContentType enum). No anilistId — keeps
  // the metadata-hydrate cron from rewriting anything.
  const ebookSeries: Array<Record<string, unknown>> = [
    {
      contentType: 'ebook',
      flow: 'single',
      title: 'The Fellowship of the Ring',
      qualityProfileId,
    },
    {
      contentType: 'ebook',
      flow: 'single',
      title: 'The Two Towers',
      qualityProfileId,
    },
  ];

  for (const s of ebookSeries) {
    const res = await page.request.post('/api/series', { data: s });
    expect(res.status(), await res.text()).toBeLessThan(400);
    const body = (await res.json()) as { id: number };
    if (memberSeriesId1 === 0) memberSeriesId1 = body.id;
    else memberSeriesId2 = body.id;
  }

  // Create the book series (ebook content type).
  const bsRes = await page.request.post('/api/book-series', {
    data: { name: 'The Lord of the Rings', contentType: 'ebook' },
  });
  expect(bsRes.status(), await bsRes.text()).toBe(201);
  const bsBody = (await bsRes.json()) as { id: number };
  bookSeriesId = bsBody.id;

  // Assign both ebook series as members.
  for (const [pos, seriesId] of [
    [1, memberSeriesId1],
    [2, memberSeriesId2],
  ] as [number, number][]) {
    const r = await page.request.post(`/api/book-series/${bookSeriesId}/members`, {
      data: { seriesId, position: pos },
    });
    expect(r.status(), await r.text()).toBeLessThan(400);
  }

  await ctx.close();
});

test.describe('Book series', () => {
  test('library collapse — book-series card shown, no standalone member cards', async ({
    page,
  }) => {
    await signIn(page, ADMIN.username, ADMIN.password);
    await page.goto('/library');

    // The book-series card collapses both member titles into one.
    const bsCard = page.getByTestId(`book-series-card-${bookSeriesId}`);
    await expect(bsCard).toBeVisible();

    // Card shows the series name.
    await expect(bsCard).toContainText('The Lord of the Rings');

    // Card sub-line: "SERIES · 2 BOOKS".
    await expect(bsCard).toContainText(/SERIES\s*·\s*2\s*BOOKS/i);

    // Member series are collapsed — their standalone /library/<id> cards must
    // not appear in the grid (they are now represented by the book-series card).
    await expect(page.locator(`a[href="/library/${memberSeriesId1}"]`)).toHaveCount(0);
    await expect(page.locator(`a[href="/library/${memberSeriesId2}"]`)).toHaveCount(0);
  });

  test('click book-series card → /library/series/<id> with book list', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);
    await page.goto('/library');

    const bsCard = page.getByTestId(`book-series-card-${bookSeriesId}`);
    await expect(bsCard).toBeVisible();
    await bsCard.click();

    // URL must change to the book-series detail route.
    await expect(page).toHaveURL(`/library/series/${bookSeriesId}`);

    // The series-page container is present.
    await expect(page.getByTestId('book-series-page')).toBeVisible();

    // The page title shows the series name.
    await expect(page.getByRole('heading', { name: /The Lord of the Rings/i })).toBeVisible();

    // Both member titles are shown as owned-book cards (linked to their series
    // detail pages via data-testid="owned-book-<seriesId>").
    await expect(page.getByTestId(`owned-book-${memberSeriesId1}`)).toBeVisible();
    await expect(page.getByTestId(`owned-book-${memberSeriesId2}`)).toBeVisible();
  });

  test('member title detail shows part-of-series card that navigates to the book series', async ({
    page,
  }) => {
    await signIn(page, ADMIN.username, ADMIN.password);
    await page.goto(`/library/${memberSeriesId1}`);

    // The "Part of series" card is present.
    const partCard = page.getByTestId('part-of-series-card');
    await expect(partCard).toBeVisible();

    // The card displays the book series name.
    await expect(partCard).toContainText('The Lord of the Rings');

    // The View button navigates to the book-series detail page.
    const viewBtn = page.getByTestId('part-of-series-view');
    await expect(viewBtn).toBeVisible();
    await viewBtn.click();

    await expect(page).toHaveURL(`/library/series/${bookSeriesId}`);
    await expect(page.getByTestId('book-series-page')).toBeVisible();
  });

  test('library search — typing a member title surfaces the book-series card', async ({
    page,
  }) => {
    await signIn(page, ADMIN.username, ADMIN.password);
    await page.goto('/library');

    // Type the second member title's name (unique enough to not match the
    // series name itself — exercises the member-title search path).
    const searchInput = page.getByRole('searchbox', { name: /search the library/i });
    await searchInput.fill('The Two Towers');

    // The book-series card must surface in flat/search mode.
    const bsCard = page.getByTestId(`book-series-card-${bookSeriesId}`);
    await expect(bsCard).toBeVisible();

    // The matchedTitle label renders when a member (not the series name itself)
    // matched the search query.
    await expect(bsCard).toContainText('The Two Towers');
  });
});
