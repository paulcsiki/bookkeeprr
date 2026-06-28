/**
 * Activity 'superseded' status e2e (Spec 35).
 *
 * A 'superseded' download is a redundant sibling cancelled after a better
 * release imported (see src/server/importer/cancel-redundant.ts). On the
 * Activity page it must:
 *   - render with the neutral solid "Superseded" badge,
 *   - appear under the Done (history) filter — DONE = completed + superseded,
 *   - expose the dismiss control (Trash icon: "Remove from qBittorrent and
 *     clear from activity"),
 *   - NOT appear under the Active filter (queued/downloading/importing only).
 *
 * The row is seeded by raw SQL inside the container (helpers/activity-seed.ts)
 * because no API creates a download in this terminal state.
 */

import { test, expect } from '@playwright/test';
import { composeDownUp } from './fixtures/compose';
import { createFirstAdmin, signIn } from './helpers/auth';
import { seedSupersededDownload, type ActivitySeed } from './helpers/activity-seed';

test.describe.configure({ timeout: 180_000 });

const ADMIN = { username: 'admin', password: 'hunter22' };

let seed: ActivitySeed;

test.beforeAll(async ({ browser }) => {
  composeDownUp();

  // First-run admin initialises the DB + a default quality profile, which the
  // raw-SQL activity seed depends on. Do it before seeding.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await createFirstAdmin(page, ADMIN);
  await ctx.close();

  seed = seedSupersededDownload();
});

test.describe('Activity — superseded downloads', () => {
  test('GET /api/downloads surfaces the seeded superseded row', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    const res = await page.request.get('/api/downloads');
    expect(res.ok(), await res.text()).toBe(true);
    const body = (await res.json()) as {
      downloads: Array<{
        id: number;
        status: string;
        qbtHash: string;
        release: { id: number; title: string } | null;
        series: { id: number; title: string } | null;
      }>;
    };

    const row = body.downloads.find((d) => d.id === seed.downloadId);
    expect(row, 'seeded download should be in the envelope').toBeDefined();
    expect(row!.status).toBe('superseded');
    expect(row!.qbtHash).toBe(seed.qbtHash);
    expect(row!.release?.title).toBe(seed.releaseTitle);
    expect(row!.series?.id).toBe(seed.seriesId);
  });

  test('superseded row shows under Done with the badge + dismiss control, not under Active', async ({
    page,
  }) => {
    await signIn(page, ADMIN.username, ADMIN.password);
    await page.goto('/activity');

    await expect(page.getByRole('heading', { name: /^Activity$/i })).toBeVisible();

    // Default filter is All — the seeded row is visible with its release title.
    const row = page.getByRole('row').filter({ hasText: seed.releaseTitle });
    await expect(row).toBeVisible();

    // The status badge: solid (secondary, not destructive) "Superseded" with the
    // explanatory native tooltip from ActivityList's StatusBadge.
    const badge = row.getByText('Superseded', { exact: true });
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute('title', 'replaced by a better release');

    // Superseded is a terminal state, so the dismiss (clear) control is offered.
    // The button is icon-only; target its native-tooltip title attribute.
    await expect(
      row.locator('button[title="Remove from qBittorrent and clear from activity"]'),
    ).toBeVisible();

    // Done filter (history) — DONE = completed + superseded, so the row stays.
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByRole('row').filter({ hasText: seed.releaseTitle })).toBeVisible();

    // Active filter — queued/downloading/importing only; superseded must vanish.
    await page.getByRole('button', { name: 'Active', exact: true }).click();
    await expect(page.getByText(seed.releaseTitle)).toHaveCount(0);

    // Sanity: the row wasn't dismissed, just filtered — All brings it back.
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.getByRole('row').filter({ hasText: seed.releaseTitle })).toBeVisible();
  });
});
