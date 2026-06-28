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

test.describe('Not-found behavior', () => {
  test('unknown route returns 404 with a sensible body', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    // API-level: the server must respond 404 (not 200/500) for an unknown route.
    const res = await page.request.get('/this-route-does-not-exist');
    expect(res.status()).toBe(404);

    // Browser-level: navigating to the unknown route should render something
    // recognisable as a 404 page — either Next.js's default "404" text or a
    // custom not-found.tsx.  We don't enforce the exact copy; tolerant assertion.
    await page.goto('/this-route-does-not-exist');
    const body = await page.locator('body').textContent();
    // Accept Next's built-in "404" digit, "not found" phrase, or any custom copy.
    expect(body?.toLowerCase()).toMatch(/404|not found/i);
  });
});
