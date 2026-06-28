import { test, expect } from '@playwright/test';
import { composeDownUp } from './fixtures/compose';
import { createFirstAdmin, signIn } from './helpers/auth';

test.describe.configure({ timeout: 180_000 });

const ADMIN = { username: 'admin', password: 'hunter22' };

let seededSeriesId: number;

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

  // Seed a single manga series that the tests below can navigate to.
  const createRes = await page.request.post('/api/series', {
    data: {
      contentType: 'manga',
      titleEnglish: 'Fullmetal Alchemist',
      status: 'finished',
      rootPath: '/media/manga/Fullmetal Alchemist',
      qualityProfileId,
    },
  });
  expect(createRes.status(), await createRes.text()).toBeLessThan(400);

  const created = (await createRes.json()) as { id: number };
  seededSeriesId = created.id;

  await ctx.close();
});

test.describe('Series detail page', () => {
  test('/library/[id] renders the series title, content-type badge, and Overview tab', async ({
    page,
  }) => {
    await signIn(page, ADMIN.username, ADMIN.password);
    await page.goto(`/library/${seededSeriesId}`);

    // The SeriesDetail <h1> shows the English title.
    await expect(page.getByRole('heading', { name: /Fullmetal Alchemist/i })).toBeVisible();

    // The Breadcrumbs include a "Library" crumb link. Scope to the breadcrumb
    // nav — the sidebar also has a "Library" link.
    await expect(
      page.getByLabel('Breadcrumb').getByRole('link', { name: /^Library$/i }),
    ).toBeVisible();

    // The tab list with "Overview" must be present.
    await expect(page.getByRole('tab', { name: /^Overview$/i })).toBeVisible();
  });

  test('GET /api/series/[id] returns the full series record', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    const res = await page.request.get(`/api/series/${seededSeriesId}`);
    expect(res.ok(), await res.text()).toBe(true);

    // The route returns the raw SeriesRow — validate key fields.
    const body = (await res.json()) as {
      id: number;
      contentType: string;
      titleEnglish: string | null;
      titleRomaji: string | null;
      status: string;
      monitoring: string;
      granularity: string;
      rootPath: string;
      qualityProfileId: number;
    };

    expect(body.id).toBe(seededSeriesId);
    expect(body.contentType).toBe('manga');
    expect(body.titleEnglish).toBe('Fullmetal Alchemist');
    expect(body.status).toBe('finished');
    expect(typeof body.monitoring, 'monitoring should be a string').toBe('string');
    expect(typeof body.granularity, 'granularity should be a string').toBe('string');
    expect(typeof body.qualityProfileId, 'qualityProfileId should be a number').toBe('number');
  });

  test('PATCH /api/series/[id] updates a field and the change persists', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    const patch = await page.request.patch(`/api/series/${seededSeriesId}`, {
      data: { monitoring: 'future' },
    });
    expect(patch.ok(), await patch.text()).toBe(true);

    const patchedBody = (await patch.json()) as { id: number; monitoring: string };
    expect(patchedBody.id).toBe(seededSeriesId);
    expect(patchedBody.monitoring).toBe('future');

    // GET confirms the value persisted.
    const get = await page.request.get(`/api/series/${seededSeriesId}`);
    expect(get.ok(), await get.text()).toBe(true);
    const getBody = (await get.json()) as { monitoring: string };
    expect(getBody.monitoring).toBe('future');
  });
});

test.describe('Series DELETE', () => {
  test('DELETE /api/series/[id] removes the series from the library list', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    // Fetch the default quality profile so we can create a throwaway series.
    const profilesRes = await page.request.get('/api/quality-profiles');
    expect(profilesRes.ok(), await profilesRes.text()).toBe(true);
    const profiles = (await profilesRes.json()) as Array<{ id: number }>;
    expect(profiles.length).toBeGreaterThan(0);
    const qualityProfileId = profiles[0]!.id;

    // Create a throwaway series dedicated to the DELETE test.
    const createRes = await page.request.post('/api/series', {
      data: {
        contentType: 'manga',
        titleEnglish: 'Throwaway Series for Delete',
        status: 'releasing',
        rootPath: '/media/manga/Throwaway',
        qualityProfileId,
      },
    });
    expect(createRes.status(), await createRes.text()).toBeLessThan(400);
    const { id: throwawayId } = (await createRes.json()) as { id: number };

    // DELETE it.
    const del = await page.request.delete(`/api/series/${throwawayId}`);
    expect(del.status()).toBe(204);

    // Confirm it's gone from the list.
    const listRes = await page.request.get('/api/series');
    expect(listRes.ok(), await listRes.text()).toBe(true);
    const listBody = (await listRes.json()) as { rows: Array<{ id: number }> };
    expect(listBody.rows.find((s) => s.id === throwawayId)).toBeUndefined();
  });
});
