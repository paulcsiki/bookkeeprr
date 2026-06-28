/**
 * Library groups e2e (SP2 web UI).
 *
 * One serial flow against a fresh compose instance:
 *   1. create the 'Engineering' group via the control-bar popover
 *   2. create the 'Architecture' subgroup via the folder card's ellipsis menu,
 *      open the group, assert the crumbs
 *   3. drag a series card onto the folder card (PATCH-backed dnd move)
 *   4. content-type filter flips to flat mode — folders hidden, grp-tag shown
 *   5. series detail Settings tab: detail-group-picker moves a series
 *   6. add dialog: add-into-picker present + selectable
 *   7. scan form: scan-group-picker + structure radios present
 *   8. naming settings surfaces the {group_path} token
 *   9. typed-name delete confirm — button armed only by the exact group name;
 *      toast reports cascade counts; folder card gone
 *
 * Server surface under test: /api/library/groups CRUD,
 * PATCH /api/series/{id} {groupId}. Spec:
 * docs/superpowers/specs/2026-06-10-library-groups-sp2-web-design.md §1–§4.
 */

import { test, expect, type Page } from '@playwright/test';
import { composeDownUp } from './fixtures/compose';
import { createFirstAdmin, signIn } from './helpers/auth';

// Stateful flow — later tests depend on earlier ones, so run serially and let
// a failure skip the rest (a CI retry restarts the worker → fresh beforeAll).
test.describe.configure({ mode: 'serial', timeout: 180_000 });

const ADMIN = { username: 'admin', password: 'hunter22' };

type GroupRow = {
  id: number;
  name: string;
  parentId: number | null;
  path: string;
  seriesCount: number;
  subgroupCount: number;
};

// Group ids resolved from the API after creation (serial mode → safe module state).
let engId = 0;
let archId = 0;

async function fetchGroups(page: Page): Promise<GroupRow[]> {
  const r = await page.request.get('/api/library/groups');
  expect(r.ok()).toBe(true);
  const body = (await r.json()) as { groups: GroupRow[] };
  return body.groups;
}

test.beforeAll(async ({ browser }) => {
  composeDownUp();

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await createFirstAdmin(page, ADMIN);
  await signIn(page, ADMIN.username, ADMIN.password);

  const profilesRes = await page.request.get('/api/quality-profiles');
  expect(profilesRes.ok()).toBe(true);
  const profiles = (await profilesRes.json()) as Array<{ id: number }>;
  expect(profiles.length, 'expected a seeded quality profile').toBeGreaterThan(0);
  const qualityProfileId = profiles[0]!.id;

  // Seed 3 series (no anilistId — keeps the metadata-hydrate cron from
  // rewriting anything). Seed order → ids 1..3.
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
      contentType: 'ebook',
      flow: 'single',
      olid: 'OL262758W',
      title: 'The Hobbit',
      qualityProfileId,
    },
  ];
  for (const s of series) {
    const res = await page.request.post('/api/series', { data: s });
    expect(res.status(), await res.text()).toBeLessThan(400);
  }

  await ctx.close();
});

test.describe('Library groups', () => {
  // Series cards keep stable /library/<id> hrefs even if titles get rewritten.
  const card = (id: number) => `a.lib-card[href="/library/${id}"]`;

  test('create a group via the New group popover → folder card with counts', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);
    await page.goto('/library');

    await page.getByTestId('new-group-btn').click();
    await page.getByTestId('new-group-input').fill('Engineering');
    await page.getByTestId('new-group-create').click();

    await expect(page.getByText('Created "Engineering"')).toBeVisible();

    const groups = await fetchGroups(page);
    const eng = groups.find((g) => g.name === 'Engineering');
    expect(eng, 'Engineering group should exist').toBeDefined();
    engId = eng!.id;

    // router.refresh() brings the folder card in — empty group counts.
    const folder = page.getByTestId(`folder-card-${engId}`);
    await expect(folder).toBeVisible();
    await expect(folder).toContainText('Engineering');
    await expect(folder).toContainText('0 SERIES');
  });

  test('create a subgroup via the folder menu → open group → crumbs render', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);
    await page.goto('/library');

    // The ellipsis menu reveals on card hover (CSS opacity).
    await page.getByTestId(`folder-card-${engId}`).hover();
    await page.getByTestId(`group-menu-${engId}`).click();
    await page.getByRole('menuitem', { name: 'New subgroup' }).click();

    // Popover opens with this group as the parent.
    await expect(page.getByText('In · Engineering')).toBeVisible();
    await page.getByTestId('new-group-input').fill('Architecture');
    await page.getByTestId('new-group-create').click();
    await expect(page.getByText('Created "Architecture"')).toBeVisible();

    const groups = await fetchGroups(page);
    const arch = groups.find((g) => g.name === 'Architecture');
    expect(arch?.parentId).toBe(engId);
    archId = arch!.id;

    // Folder card subline now counts the subgroup.
    await expect(page.getByTestId(`folder-card-${engId}`)).toContainText('1 FOLDER');

    // Open the group → URL carries ?group=, crumbs render Library / Engineering,
    // and the subgroup's folder card is inside.
    await page.getByTestId(`folder-card-${engId}`).click();
    await expect(page).toHaveURL(new RegExp(`group=${engId}`));
    const crumbs = page.getByTestId('group-crumbs');
    await expect(crumbs).toBeVisible();
    await expect(crumbs.getByRole('button', { name: 'Library' })).toBeVisible();
    await expect(crumbs.locator('[aria-current="location"]')).toHaveText(/Engineering/);
    await expect(page.getByTestId(`folder-card-${archId}`)).toBeVisible();

    // The Library crumb navigates back to root.
    await crumbs.getByRole('button', { name: 'Library' }).click();
    await expect(page).not.toHaveURL(/group=/);
  });

  test('drag a series card onto the folder card moves it into the group', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);
    await page.goto('/library');

    const source = page.locator(card(1));
    const folder = page.getByTestId(`folder-card-${engId}`);
    await expect(source).toBeVisible();
    await expect(folder).toBeVisible();

    // Playwright's dragTo drives Chromium's native HTML5 dnd (dataTransfer
    // included), which is what the grid's dragstart/drop handlers speak.
    await source.dragTo(folder);

    // PATCH /api/series/1 {groupId} lands server-side — recursive count flips.
    await expect
      .poll(async () => (await fetchGroups(page)).find((g) => g.id === engId)?.seriesCount, {
        message: 'Engineering seriesCount should become 1 after the dnd move',
      })
      .toBe(1);

    // Optimistic update + refresh: the card left the root grid…
    await expect(page.locator(card(1))).toHaveCount(0);

    // …and a reload inside the group shows it there.
    await page.goto(`/library?group=${engId}`);
    await expect(page.locator(card(1))).toBeVisible();
  });

  test('content-type filter flips to flat mode — folders hidden, grp-tag shown', async ({
    page,
  }) => {
    await signIn(page, ADMIN.username, ADMIN.password);
    await page.goto('/library');
    await expect(page.getByTestId(`folder-card-${engId}`)).toBeVisible();

    // Filter chips render "<Label> <count>" — anchor to dodge the card pills.
    await page.getByRole('button', { name: /^Manga\s/ }).click();

    // Flat mode: folders gone, all matches shown, grouped cards carry grp-tags.
    await expect(page.getByTestId(`folder-card-${engId}`)).toHaveCount(0);
    await expect(page.locator(card(1))).toBeVisible(); // grouped manga, visible in flat mode
    await expect(page.locator(`${card(1)} .grp-tag`)).toHaveText(/Engineering/);
    await expect(page.locator(card(2))).toBeVisible(); // ungrouped manga
    await expect(page.locator(`${card(2)} .grp-tag`)).toHaveCount(0);
    await expect(page.locator(card(3))).toHaveCount(0); // ebook filtered out
  });

  test('series detail Group picker moves the series', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);
    await page.goto('/library/2');

    await page.getByRole('tab', { name: 'Settings' }).click();
    await page.getByTestId('detail-group-picker').click();
    await page.getByRole('option', { name: 'Engineering' }).click();

    // The picker PATCHes immediately — Engineering now holds both series.
    await expect
      .poll(async () => (await fetchGroups(page)).find((g) => g.id === engId)?.seriesCount, {
        message: 'Engineering seriesCount should become 2 after the picker move',
      })
      .toBe(2);
    await expect(page.getByTestId('detail-group-picker')).toContainText('Engineering');
  });

  test('add dialog has the Add into picker', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);
    await page.goto('/library');

    await page.getByRole('button', { name: 'Search to add to your library' }).click();
    const picker = page.getByTestId('add-into-picker');
    await expect(picker).toBeVisible();
    await expect(picker).toContainText('Library root');

    // Selection works (full add flow needs live metadata sources — out of scope).
    await picker.click();
    await page.getByRole('option', { name: 'Engineering' }).click();
    await expect(picker).toContainText('Engineering');
    await page.keyboard.press('Escape');
  });

  test('scan form has the group target and structure radios', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);
    await page.goto('/settings/library/scan');

    await expect(page.getByTestId('scan-group-picker')).toBeVisible();
    await expect(page.getByTestId('scan-structure-flat')).toBeVisible();
    await expect(page.getByTestId('scan-structure-mirror')).toBeVisible();

    // Flat is the default; the mirror radio is selectable.
    await expect(page.locator('#scan-structure-flat')).toHaveAttribute('data-state', 'checked');
    await page.getByTestId('scan-structure-mirror').click();
    await expect(page.locator('#scan-structure-mirror')).toHaveAttribute('data-state', 'checked');
  });

  test('naming settings surface the {group_path} token', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);
    await page.goto('/settings/naming');
    await expect(page.getByText('{group_path}').first()).toBeVisible();
  });

  test('delete with content requires typing the exact group name', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);
    await page.goto('/library');

    await page.getByTestId(`folder-card-${engId}`).hover();
    await page.getByTestId(`group-menu-${engId}`).click();
    await page.getByRole('menuitem', { name: 'Delete…' }).click();

    // Content-bearing group → typed-name confirm. Counts include the subgroup
    // and both moved series.
    await expect(page.getByText(/This deletes/)).toBeVisible();
    const confirmBtn = page.getByTestId('delete-group-confirm-btn');
    await expect(confirmBtn).toBeDisabled();

    // Near-miss (wrong case) keeps it disarmed — the match is exact.
    await page.getByTestId('delete-group-confirm-input').fill('engineering');
    await expect(confirmBtn).toBeDisabled();

    await page.getByTestId('delete-group-confirm-input').fill('Engineering');
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    // Cascade toast reports counts: Engineering + Architecture, 2 series.
    await expect(page.getByText('Deleted 2 groups · 2 series')).toBeVisible();
    await expect(page.getByTestId(`folder-card-${engId}`)).toHaveCount(0);

    const groups = await fetchGroups(page);
    expect(groups).toHaveLength(0);
  });
});
