import { test, expect } from '@playwright/test';
import { composeDownUp } from './fixtures/compose';

test.describe.configure({ timeout: 120_000 });
test.beforeAll(async () => {
  composeDownUp();
});

test.describe('First-run wizard', () => {
  test('initial visit redirects to /first-run', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/first-run/);
  });

  test('rejects passwords shorter than 8 chars', async ({ page }) => {
    await page.goto('/first-run');
    await page.getByRole('button', { name: /Begin setup/i }).click();
    await page.locator('#admin-email').fill('admin@example.com');
    await page.locator('#admin-password').fill('short');
    await page.locator('#admin-confirm').fill('short');
    await page.getByRole('button', { name: /Create admin/i }).click();
    // Browser-native minLength validation OR inline error keeps us on step 1.
    await expect(page.getByText('STEP 1 · ADMIN ACCOUNT')).toBeVisible();
  });

  test('creates the first admin and advances to step 2', async ({ page, context }) => {
    await page.goto('/first-run');
    await page.getByRole('button', { name: /Begin setup/i }).click();
    await page.locator('#admin-email').fill('admin@example.com');
    await page.locator('#admin-password').fill('hunter22');
    await page.locator('#admin-confirm').fill('hunter22');
    await page.getByRole('button', { name: /Create admin/i }).click();
    await page.getByText('STEP 2 · STORAGE').waitFor({ timeout: 15_000 });
    const cookies = await context.cookies();
    expect(cookies.find((c) => c.name === 'bookkeeprr_session')).toBeDefined();
  });

  test('/api/health reachable without auth', async ({ request }) => {
    const r = await request.get('/api/health');
    expect(r.ok()).toBe(true);
  });
});
