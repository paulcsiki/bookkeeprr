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

test.describe('Account page', () => {
  test('/account page renders profile + security + appearance + sessions sections in nav', async ({
    page,
  }) => {
    await signIn(page, ADMIN.username, ADMIN.password);
    await page.goto('/account');

    // The AccountNav renders a link per section (ACCOUNT_NAV in
    // components/shell/account-nav.ts): Profile, Security, Two-factor,
    // Sessions, API keys, Notifications, Appearance, Danger zone.
    await expect(page.getByRole('link', { name: /^Profile$/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Security$/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Appearance$/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Sessions$/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Danger zone$/i })).toBeVisible();
  });

  test('sessions section lists the current session', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    // The API returns { sessions: Array<{ id, current, createdAt, lastSeenAt, userAgent, ipAddress }> }.
    const res = await page.request.get('/api/auth/sessions');
    expect(res.ok(), await res.text()).toBe(true);

    const body = (await res.json()) as {
      sessions: Array<{
        id: string;
        current: boolean;
        createdAt: string;
        lastSeenAt: string;
        userAgent: string | null;
        ipAddress: string | null;
      }>;
    };

    expect(body.sessions.length).toBeGreaterThan(0);
    // At least one session should be flagged as the current one.
    const current = body.sessions.find((s) => s.current);
    expect(current, 'expected a session marked current: true').toBeDefined();
    // The current session was created recently (within the last 60 seconds).
    const age = Date.now() - new Date(current!.createdAt).getTime();
    expect(age).toBeLessThan(60_000);
  });

  test('avatar upload: POST /api/auth/me/avatar accepts a PNG', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    // Minimal valid 1×1 PNG (base64-encoded).
    const PNG_1x1 = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
      'base64',
    );

    // POST multipart form-data to /api/auth/me/avatar.
    // The route accepts any File entry in the form — field name is arbitrary.
    const uploadRes = await page.request.post('/api/auth/me/avatar', {
      multipart: {
        file: {
          name: 'avatar.png',
          mimeType: 'image/png',
          buffer: PNG_1x1,
        },
      },
    });
    expect(uploadRes.ok(), `upload failed: ${await uploadRes.text()}`).toBe(true);

    const uploadBody = (await uploadRes.json()) as { avatarUrl: string };
    expect(typeof uploadBody.avatarUrl, 'avatarUrl should be a string').toBe('string');
    expect(uploadBody.avatarUrl).toMatch(/^\/api\/auth\/me\/avatar\/\d+$/);

    // Fetch the avatar back — expect 200 + image/png content-type.
    const avatarRes = await page.request.get(uploadBody.avatarUrl);
    expect(avatarRes.ok(), `avatar GET failed: ${await avatarRes.text()}`).toBe(true);
    const contentType = avatarRes.headers()['content-type'] ?? '';
    expect(contentType).toMatch(/^image\/(png|jpeg|webp)/);
  });

  test('session revoke: DELETE /api/auth/sessions/[id] removes the session', async ({
    browser,
    page,
  }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    // Open a second browser context and sign in there — creates a second session.
    const secondCtx = await browser.newContext();
    const secondPage = await secondCtx.newPage();
    await signIn(secondPage, ADMIN.username, ADMIN.password);

    // From the first context: expect 2 sessions.
    const listRes = await page.request.get('/api/auth/sessions');
    expect(listRes.ok(), `sessions GET failed: ${await listRes.text()}`).toBe(true);

    const listBody = (await listRes.json()) as {
      sessions: Array<{ id: string; current: boolean }>;
    };
    expect(listBody.sessions.length, 'expected 2 sessions after second login').toBeGreaterThanOrEqual(2);

    // Identify the session that is NOT the current one.
    const otherSession = listBody.sessions.find((s) => !s.current);
    expect(otherSession, 'expected at least one non-current session').toBeDefined();
    const tokenPrefix = otherSession!.id; // The API already slices to 12 chars.

    // DELETE the other session.
    const deleteRes = await page.request.delete(`/api/auth/sessions/${tokenPrefix}`);
    expect(deleteRes.ok(), `session DELETE failed: ${await deleteRes.text()}`).toBe(true);
    const deleteBody = (await deleteRes.json()) as { ok: boolean };
    expect(deleteBody.ok).toBe(true);

    // GET sessions again — the revoked session should be gone, current still present.
    // Earlier tests in this file create their own sessions, so we assert
    // the relative delta rather than a fixed count.
    const afterRes = await page.request.get('/api/auth/sessions');
    expect(afterRes.ok()).toBe(true);
    const afterBody = (await afterRes.json()) as {
      sessions: Array<{ id: string; current: boolean }>;
    };
    expect(afterBody.sessions.length).toBe(listBody.sessions.length - 1);
    expect(afterBody.sessions.find((s) => s.id === tokenPrefix)).toBeUndefined();
    expect(afterBody.sessions.some((s) => s.current)).toBe(true);

    await secondCtx.close();
  });

  test('notifications preferences: GET + PATCH /api/auth/me/notifications round-trips', async ({
    page,
  }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    // GET current prefs.
    const getRes = await page.request.get('/api/auth/me/notifications');
    expect(getRes.ok(), `GET failed: ${await getRes.text()}`).toBe(true);

    const getBody = (await getRes.json()) as {
      prefs: {
        eventGrabSuccess: boolean;
        eventImportSuccess: boolean;
        eventFailure: boolean;
        eventUpdateAvailable: boolean;
        channel: string;
      };
    };
    expect(getBody.prefs).toBeDefined();
    expect(typeof getBody.prefs.eventGrabSuccess).toBe('boolean');
    expect(typeof getBody.prefs.eventImportSuccess).toBe('boolean');
    expect(typeof getBody.prefs.eventFailure).toBe('boolean');
    expect(typeof getBody.prefs.eventUpdateAvailable).toBe('boolean');
    expect(typeof getBody.prefs.channel).toBe('string');

    // PATCH: toggle eventUpdateAvailable (default is false → set to true).
    const originalValue = getBody.prefs.eventUpdateAvailable;
    const patchRes = await page.request.patch('/api/auth/me/notifications', {
      data: { eventUpdateAvailable: !originalValue },
    });
    expect(patchRes.ok(), `PATCH failed: ${await patchRes.text()}`).toBe(true);

    const patchBody = (await patchRes.json()) as {
      prefs: { eventUpdateAvailable: boolean };
    };
    expect(patchBody.prefs.eventUpdateAvailable).toBe(!originalValue);

    // GET again — verify the change persisted.
    const getRes2 = await page.request.get('/api/auth/me/notifications');
    expect(getRes2.ok()).toBe(true);
    const getBody2 = (await getRes2.json()) as {
      prefs: { eventUpdateAvailable: boolean };
    };
    expect(getBody2.prefs.eventUpdateAvailable).toBe(!originalValue);
  });

  test('avatar delete: DELETE /api/auth/me/avatar clears the stored avatar', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    // Minimal valid 1×1 PNG (base64-encoded).
    const PNG_1x1 = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
      'base64',
    );

    // Upload an avatar first.
    const uploadRes = await page.request.post('/api/auth/me/avatar', {
      multipart: {
        file: {
          name: 'avatar.png',
          mimeType: 'image/png',
          buffer: PNG_1x1,
        },
      },
    });
    expect(uploadRes.ok(), `upload failed: ${await uploadRes.text()}`).toBe(true);
    const uploadBody = (await uploadRes.json()) as { avatarUrl: string };
    const avatarUrl = uploadBody.avatarUrl;

    // Confirm the avatar is served before deleting.
    const beforeRes = await page.request.get(avatarUrl);
    expect(beforeRes.ok(), `avatar GET before delete failed: ${await beforeRes.text()}`).toBe(true);

    // DELETE the avatar.
    const deleteRes = await page.request.delete('/api/auth/me/avatar');
    expect(deleteRes.ok(), `avatar DELETE failed: ${await deleteRes.text()}`).toBe(true);
    const deleteBody = (await deleteRes.json()) as { ok: boolean };
    expect(deleteBody.ok).toBe(true);

    // GET the avatar after delete — expect 404 (no avatar set).
    const afterRes = await page.request.get(avatarUrl);
    expect(afterRes.status(), 'expected 404 after avatar delete').toBe(404);
  });
});

// Isolated describe block for the destructive delete-account test.
// Uses its own fresh environment so it runs after all the above tests.
test.describe('Account deletion', () => {
  const DELETE_USER = { username: 'deleteme@example.com', password: 'hunter22' };

  test.beforeAll(async ({ browser }) => {
    composeDownUp();

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await createFirstAdmin(page, DELETE_USER);
    await ctx.close();
  });

  test('delete-account: DELETE /api/auth/me with password confirmation removes the user', async ({
    page,
  }) => {
    await signIn(page, DELETE_USER.username, DELETE_USER.password);

    // Confirm we are authenticated before deletion.
    const meBefore = await page.request.get('/api/auth/me');
    expect(meBefore.ok()).toBe(true);
    const meBeforeBody = (await meBefore.json()) as { user: { username: string } | null };
    expect(meBeforeBody.user).not.toBeNull();
    expect(meBeforeBody.user!.username).toBe(DELETE_USER.username);

    // DELETE /api/auth/me — requires { currentPassword } in body.
    const deleteRes = await page.request.delete('/api/auth/me', {
      data: { currentPassword: DELETE_USER.password },
    });
    expect(deleteRes.ok(), `delete-account failed: ${await deleteRes.text()}`).toBe(true);
    const deleteBody = (await deleteRes.json()) as { ok: boolean };
    expect(deleteBody.ok).toBe(true);

    // GET /api/auth/me afterward — session is cleared, expect { user: null }.
    const meAfter = await page.request.get('/api/auth/me');
    // Either 401 or 200 with user:null is acceptable — both mean unauthenticated.
    if (meAfter.status() === 200) {
      const meAfterBody = (await meAfter.json()) as { user: unknown };
      expect(meAfterBody.user, 'user should be null after account deletion').toBeNull();
    } else {
      expect(meAfter.status()).toBe(401);
    }
  });
});
