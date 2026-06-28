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

test.describe('Discover page', () => {
  test('/discover page renders browse skeleton or rows', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);
    await page.goto('/discover');

    // The DiscoverClient renders an h1 "Discover" in the sticky header.
    await expect(page.getByRole('heading', { name: /^Discover$/i })).toBeVisible();

    // At least one of: the search input, content-type filter, or a browse-row heading is visible.
    // The search input is a plain <input> with placeholder "Search …" — check by role.
    // The ContentTypeFilter renders buttons; a browse row heading is a font-display span.
    // We use a soft OR: pass if any of the three selectors is visible.
    const searchInput = page.locator('input[type="text"]').first();
    const isSearchVisible = await searchInput.isVisible().catch(() => false);

    const filterButton = page.getByRole('button', { name: /^All\b/i }).first();
    const isFilterVisible = await filterButton.isVisible().catch(() => false);

    // A browse row heading — the fixture data always renders "Trending now" etc.
    const browseHeading = page.getByText(/Trending now|Popular this season|New this week/i).first();
    const isBrowseVisible = await browseHeading.isVisible().catch(() => false);

    expect(
      isSearchVisible || isFilterVisible || isBrowseVisible,
      'expected at least one discover UI element (search input, filter chip, or browse heading) to be visible',
    ).toBe(true);
  });

  test('GET /api/discover/sources returns configured sources list', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    const res = await page.request.get('/api/discover/sources');
    expect(res.ok(), await res.text()).toBe(true);

    const body = (await res.json()) as {
      sources: Array<{ id: string; label: string; configured: boolean }>;
    };

    expect(Array.isArray(body.sources), 'expected sources to be an array').toBe(true);
    expect(body.sources.length, 'expected exactly 5 sources').toBe(5);

    const ids = body.sources.map((s) => s.id);
    expect(ids).toContain('anilist');
    expect(ids).toContain('mangadex');
    expect(ids).toContain('comicvine');
    expect(ids).toContain('openlibrary');
    expect(ids).toContain('audnex');

    // Each source must have id (string), label (string), configured (boolean).
    for (const source of body.sources) {
      expect(typeof source.id, `source.id for ${source.id}`).toBe('string');
      expect(typeof source.label, `source.label for ${source.id}`).toBe('string');
      expect(typeof source.configured, `source.configured for ${source.id}`).toBe('boolean');
    }

    // Sources with no external API key requirement are always configured.
    const alwaysOn = ['anilist', 'mangadex', 'openlibrary', 'audnex'];
    for (const id of alwaysOn) {
      const src = body.sources.find((s) => s.id === id);
      expect(src?.configured, `${id} should always be configured`).toBe(true);
    }
  });

  test('/api/discover/browse returns trending/popular/fresh rows envelope', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    const res = await page.request.get('/api/discover/browse');
    expect(res.ok(), await res.text()).toBe(true);

    const body = (await res.json()) as {
      rows: Array<{
        id: string;
        label: string;
        meta: string;
        items: Array<{
          contentType: string;
          sourceId: string;
          title: string;
          author?: string | null;
          isbn?: string | null;
          coverUrl?: string | null;
          detail?: string | null;
          inLib?: boolean;
        }>;
      }>;
    };

    expect(Array.isArray(body.rows), 'expected rows to be an array').toBe(true);
    expect(body.rows.length, 'expected exactly 3 rows').toBe(3);

    const ids = body.rows.map((r) => r.id);
    expect(ids).toContain('trending');
    expect(ids).toContain('popular');
    expect(ids).toContain('fresh');

    // Each row must have id, label, meta, and items array.
    for (const row of body.rows) {
      expect(typeof row.label, `row ${row.id}: label`).toBe('string');
      expect(typeof row.meta, `row ${row.id}: meta`).toBe('string');
      expect(Array.isArray(row.items), `row ${row.id}: items`).toBe(true);

      // If items are present, validate their shape.
      for (const item of row.items) {
        expect(typeof item.contentType, 'item.contentType').toBe('string');
        expect(typeof item.sourceId, 'item.sourceId').toBe('string');
        expect(typeof item.title, 'item.title').toBe('string');
      }
    }
  });
});
