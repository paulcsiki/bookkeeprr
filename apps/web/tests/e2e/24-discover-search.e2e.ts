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

test.describe('Discover search API', () => {
  test('GET /api/discover/search returns the canonical results envelope', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    // Call with a generic query; providers may return nothing in the e2e env.
    // The point is: the endpoint is wired, the query is parsed, and the response
    // matches the expected shape { results: DiscoverResult[], tookMs: number }.
    const res = await page.request.get('/api/discover/search?q=test');
    expect(res.ok(), await res.text()).toBe(true);

    const body = (await res.json()) as {
      results: Array<{
        contentType: string;
        sourceId: string;
        title: string;
        year?: number | null;
        author?: string | null;
        isbn?: string | null;
        coverUrl?: string | null;
        source: string;
        detail: string | null;
        inLib: boolean;
      }>;
      tookMs: number;
      // errors is only present when one or more providers fail.
      errors?: Record<string, string>;
    };

    expect(Array.isArray(body.results), 'results should be an array').toBe(true);
    expect(typeof body.tookMs, 'tookMs should be a number').toBe('number');
    expect(body.tookMs).toBeGreaterThanOrEqual(0);

    // Validate the shape of any returned items.
    for (const item of body.results) {
      expect(typeof item.contentType, 'item.contentType').toBe('string');
      expect(typeof item.sourceId, 'item.sourceId').toBe('string');
      expect(typeof item.title, 'item.title').toBe('string');
      expect(typeof item.source, 'item.source').toBe('string');
      expect(typeof item.inLib, 'item.inLib').toBe('boolean');
    }
  });

  test('GET /api/discover/search with missing q returns 400', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    // No q parameter — the Zod schema requires q: string().min(1).
    const res = await page.request.get('/api/discover/search');
    expect(res.status()).toBe(400);

    const body = (await res.json()) as { error: string };
    expect(body.error).toBeTruthy();
  });
});
