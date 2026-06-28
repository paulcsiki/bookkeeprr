import { test, expect } from '@playwright/test';
import { composeDownUp } from './fixtures/compose';
import { createFirstAdmin, signIn } from './helpers/auth';

test.describe.configure({ timeout: 180_000 });

test.beforeAll(async ({ browser }) => {
  composeDownUp();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await createFirstAdmin(page, { username: 'admin', password: 'hunter22' });
  await ctx.close();
});

test.describe('User management', () => {
  test('admin POSTs /api/users to create a new account', async ({ page }) => {
    await signIn(page, 'admin', 'hunter22');
    const r = await page.request.post('/api/users', {
      data: {
        username: 'bob',
        password: 'bobpwd123',
        role: 'user',
        mustChangePassword: false,
      },
    });
    expect(r.ok()).toBe(true);
  });

  test('newly-created user can sign in via /login form', async ({ browser, page }) => {
    await signIn(page, 'admin', 'hunter22');
    await page.request.post('/api/users', {
      data: {
        username: 'carol',
        password: 'carolpwd123',
        role: 'user',
        mustChangePassword: false,
      },
    });
    // Fresh browser context — Carol logs in.
    const carolCtx = await browser.newContext();
    const carolPage = await carolCtx.newPage();
    await signIn(carolPage, 'carol', 'carolpwd123');
    const cookies = await carolCtx.cookies();
    expect(cookies.find((c) => c.name === 'bookkeeprr_session')).toBeDefined();
    const me = await carolPage.request.get('/api/auth/me');
    expect(me.ok()).toBe(true);
    const meBody = (await me.json()) as { user: { username: string; role: string } | null };
    expect(meBody.user?.username).toBe('carol');
    expect(meBody.user?.role).toBe('user');
    await carolCtx.close();
  });

  test('admin DELETEs a user and they can no longer authenticate', async ({ browser, page }) => {
    await signIn(page, 'admin', 'hunter22');
    const created = await page.request.post('/api/users', {
      data: {
        username: 'dave',
        password: 'davepwd123',
        role: 'user',
        mustChangePassword: false,
      },
    });
    expect(created.ok()).toBe(true);
    const body = (await created.json()) as { user: { id: number } };
    const userId = body.user.id;
    const del = await page.request.delete(`/api/users/${userId}`);
    expect(del.ok()).toBe(true);
    // Dave can no longer sign in.
    const daveCtx = await browser.newContext();
    const davePage = await daveCtx.newPage();
    await davePage.goto('/login');
    await davePage.locator('#username').fill('dave');
    await davePage.locator('#password').fill('davepwd123');
    await davePage.getByRole('button', { name: /^Sign in$/i }).click();
    await expect(davePage).toHaveURL(/\/login/);
    await daveCtx.close();
  });

  test('admin PATCHes user role via /api/users/:id', async ({ page }) => {
    await signIn(page, 'admin', 'hunter22');
    const created = await page.request.post('/api/users', {
      data: {
        username: 'eve',
        password: 'evepwd123',
        role: 'user',
        mustChangePassword: false,
      },
    });
    const body = (await created.json()) as { user: { id: number } };
    const r = await page.request.patch(`/api/users/${body.user.id}`, {
      data: { role: 'admin' },
    });
    expect(r.ok()).toBe(true);
    const list = await page.request.get('/api/users');
    const listBody = (await list.json()) as {
      users: Array<{ username: string; role: string }>;
    };
    const eve = listBody.users.find((u) => u.username === 'eve');
    expect(eve?.role).toBe('admin');
  });
});
