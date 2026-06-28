import { test, expect } from '@playwright/test';
import { composeDownUp } from './fixtures/compose';
import { createFirstAdmin, signIn } from './helpers/auth';

test.describe.configure({ timeout: 180_000 });

const ADMIN = { username: 'admin@example.com', password: 'hunter22' };

test.beforeAll(async ({ browser }) => {
  composeDownUp();

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await createFirstAdmin(page, ADMIN);
  await ctx.close();
});

test.describe('Password change', () => {
  test('POST /api/auth/change-password rotates password; old fails; new works', async ({
    page,
  }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    const newPassword = 'newpass1234';

    // Change the password.
    const changeRes = await page.request.post('/api/auth/change-password', {
      data: { currentPassword: ADMIN.password, newPassword },
    });
    expect(changeRes.ok(), `change-password failed: ${await changeRes.text()}`).toBe(true);
    const changeBody = (await changeRes.json()) as { ok: boolean };
    expect(changeBody.ok).toBe(true);

    // The change-password route revokes all sessions and issues a fresh one.
    // Clear cookies to simulate being signed out on all prior sessions.
    await page.context().clearCookies();

    // Old password must now be rejected.
    const oldLoginRes = await page.request.post('/api/auth/login', {
      data: { username: ADMIN.username, password: ADMIN.password },
    });
    expect(oldLoginRes.status()).toBe(401);

    // New password must be accepted.
    const newLoginRes = await page.request.post('/api/auth/login', {
      data: { username: ADMIN.username, password: newPassword },
    });
    expect(newLoginRes.ok(), `new-password login failed: ${await newLoginRes.text()}`).toBe(true);
    const newLoginBody = (await newLoginRes.json()) as {
      user: { username: string; role: string };
    };
    expect(newLoginBody.user.username).toBe(ADMIN.username);
  });
});
