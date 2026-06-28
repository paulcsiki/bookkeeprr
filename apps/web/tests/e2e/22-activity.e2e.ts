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

test.describe('Activity page', () => {
  test('/activity page renders the Activity heading', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);
    await page.goto('/activity');

    // The PageHeader renders an h1 with the title "Activity".
    await expect(page.getByRole('heading', { name: /^Activity$/i })).toBeVisible();

    // In a fresh install there are no downloads; the subtitle should indicate the idle state.
    // The subtitle text is "Recent downloads and import history." when nothing is active.
    // We use a tolerant selector — either the subtitle or the list container must be present.
    const subtitleOrList = page.getByText(/Recent downloads|Active|Queued|History/i).first();
    await expect(subtitleOrList).toBeVisible();
  });

  test('GET /api/downloads returns the canonical downloads envelope', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    const res = await page.request.get('/api/downloads');
    expect(res.ok(), await res.text()).toBe(true);

    // The route always returns { downloads: Array<DownloadRow> }.
    // In a fresh install the array is empty — we check the shape, not the count.
    const body = (await res.json()) as {
      downloads: Array<{
        id: number;
        status: string;
        addedAt: string;
        // optional live-stats fields
        progress: number | null;
        downloadSpeed: number | null;
        eta: number | null;
        seeds: number | null;
        sizeBytes: number | null;
        qbtHash: string | null;
        completedAt: string | null;
        importedAt: string | null;
        error: string | null;
        release: { id: number; title: string; indexerGuid: string } | null;
        series: { id: number; title: string } | null;
      }>;
    };

    expect(Array.isArray(body.downloads), 'downloads should be an array').toBe(true);

    // Validate any present rows.
    for (const d of body.downloads) {
      expect(typeof d.id, 'id should be a number').toBe('number');
      expect(typeof d.status, 'status should be a string').toBe('string');
      expect(typeof d.addedAt, 'addedAt should be a string').toBe('string');
    }
  });
});
