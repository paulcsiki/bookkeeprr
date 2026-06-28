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

test.describe('Version endpoint', () => {
  test('GET /api/mobile/version returns build metadata (anonymous endpoint)', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    const res = await page.request.get('/api/mobile/version');
    expect(res.ok(), `version GET failed: ${await res.text()}`).toBe(true);
    expect(res.status()).toBe(200);

    const body = (await res.json()) as {
      current: string;
      min_supported: string;
    };

    // Both fields must be present and be semver-like strings.
    expect(typeof body.current).toBe('string');
    expect(body.current.length).toBeGreaterThan(0);
    // Semver has at least one dot (e.g. "0.1.0").
    expect(body.current).toMatch(/^\d+\.\d+/);

    expect(typeof body.min_supported).toBe('string');
    expect(body.min_supported.length).toBeGreaterThan(0);
    expect(body.min_supported).toMatch(/^\d+\.\d+/);
  });

  test('GET /api/mobile/version is reachable without authentication', async ({ page }) => {
    // The endpoint is documented as anonymous — verify it responds 200 with no
    // session cookie present.
    const res = await page.request.get('/api/mobile/version', {
      // Playwright's page.request inherits the session context. Send the request
      // from a fresh context that was never signed in.
    });
    expect(res.ok(), `anonymous version GET failed: ${await res.text()}`).toBe(true);

    const body = (await res.json()) as { current: string; min_supported: string };
    expect(typeof body.current).toBe('string');
    expect(typeof body.min_supported).toBe('string');
  });
});
