import { test, expect } from '@playwright/test';
import { composeDownUp } from './fixtures/compose';
import { createFirstAdmin, signIn } from './helpers/auth';

test.describe.configure({ timeout: 180_000 });

test.beforeAll(async ({ browser }) => {
  composeDownUp();
  // Bootstrap admin once for the file — each test runs in its own context.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await createFirstAdmin(page, { username: 'admin', password: 'hunter22' });
  await ctx.close();
});

test.describe('Forms auth', () => {
  test('admin can sign in via the form', async ({ page, context }) => {
    await signIn(page, 'admin', 'hunter22');
    await expect(page).not.toHaveURL(/\/login/);
    const cookies = await context.cookies();
    expect(cookies.find((c) => c.name === 'bookkeeprr_session')).toBeDefined();
  });

  test('bad password keeps user on /login', async ({ page, context }) => {
    await page.goto('/login');
    await page.locator('#username').fill('admin');
    await page.locator('#password').fill('wrongpwd');
    await page.getByRole('button', { name: /^Sign in$/i }).click();
    await expect(page).toHaveURL(/\/login/);
    const cookies = await context.cookies();
    expect(cookies.find((c) => c.name === 'bookkeeprr_session')).toBeUndefined();
  });

  test('logout via context.clearCookies() leaves no session cookie', async ({ page, context }) => {
    await signIn(page, 'admin', 'hunter22');
    let cookies = await context.cookies();
    expect(cookies.find((c) => c.name === 'bookkeeprr_session')).toBeDefined();
    await context.clearCookies();
    cookies = await context.cookies();
    expect(cookies.find((c) => c.name === 'bookkeeprr_session')).toBeUndefined();
  });

  test('unauthenticated /library redirects to /login with next param', async ({ page }) => {
    // Fresh context — no cookies set.
    await page.goto('/library');
    await expect(page).toHaveURL(/\/login/);
    const url = new URL(page.url());
    expect(url.searchParams.get('next')).toBe('/library');
  });

  test('after sign-in, /api/auth/me reports the authenticated user', async ({ page }) => {
    await signIn(page, 'admin', 'hunter22');
    const r = await page.request.get('/api/auth/me');
    expect(r.ok()).toBe(true);
    // The redesigned onboarding registers the admin by email and stores the
    // email as the username (see helpers/auth.ts → loginId).
    const body = (await r.json()) as { user: { username: string } | null };
    expect(body.user?.username).toBe('admin@example.com');
  });
});
