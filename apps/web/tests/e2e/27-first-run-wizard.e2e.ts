import { test, expect } from '@playwright/test';
import { composeDownUp } from './fixtures/compose';

test.describe.configure({ timeout: 180_000 });

test.beforeAll(async () => {
  composeDownUp();
});

test.describe('First-run wizard — steps 2-4', () => {
  /**
   * Walk through the full wizard from step 1 to step 4.
   *
   * Step 1 — create admin (covered by 01-first-run; we repeat it here to drive
   *           steps 2-4 in a fresh environment).
   * Step 2 — paths review. Both /config and /media are writable in the e2e
   *           env, so the Next button should be enabled immediately.
   * Step 3 — qBittorrent setup. Save is required before Next is enabled. We
   *           save with dummy credentials (no qBt reachability check).
   * Step 4 — done step. Auto-calls /api/first-run/complete on mount and shows
   *           the "You're all set" heading + navigation links.
   */
  test('wizard advances from step 1 through step 4 completion', async ({ page }) => {
    await page.goto('/first-run');
    await page.getByRole('button', { name: /Begin setup/i }).click();

    // --- Step 1: create admin ---
    await page.locator('#admin-email').fill('admin@example.com');
    await page.locator('#admin-password').fill('hunter22');
    await page.locator('#admin-confirm').fill('hunter22');
    await page.getByRole('button', { name: /Create admin/i }).click();
    await page.getByText('STEP 2 · STORAGE').waitFor({ timeout: 15_000 });

    // --- Step 2: paths review ---
    // The "Continue" button is enabled when both paths are writable (they are in e2e).
    const nextStep2 = page.getByRole('button', { name: /^Continue$/i });
    await expect(nextStep2).toBeEnabled({ timeout: 10_000 });
    await nextStep2.click();
    await page.getByText('STEP 3 · DOWNLOAD CLIENT').waitFor({ timeout: 10_000 });

    // --- Step 3: qBittorrent ---
    // Fill minimal qBt credentials and click Save; that enables the Next button.
    await page.locator('#host').fill('qbittorrent');
    await page.locator('#port').fill('8080');
    await page.locator('#username').fill('admin');
    await page.locator('#password').fill('adminadmin');

    // Click the "Save" button (not "Test" or "Next").
    await page.getByRole('button', { name: /^Save$/i }).click();

    // Wait for the "Saved" toast or for the Next button to become enabled.
    const nextStep3 = page.getByRole('button', { name: /^Next$/i });
    await expect(nextStep3).toBeEnabled({ timeout: 10_000 });
    await nextStep3.click();
    await page.getByText(/Your reading-room is ready/i).waitFor({ timeout: 10_000 });

    // --- Step 4: done ---
    // DoneStep auto-POSTs /api/first-run/complete; shows "Your reading-room is ready"
    // and the two navigation links once the POST succeeds.
    await expect(page.getByRole('heading', { name: /Your reading-room is ready/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/Add a series/i)).toBeVisible();
    await expect(page.getByText(/Go to library/i)).toBeVisible();
  });

  test('POST /api/first-run/complete returns ok and /library is accessible', async ({ page }) => {
    // The previous test already ran the wizard, so an admin exists and
    // the first-run status may already be set. Call the endpoint directly and
    // verify the response + that /library is reachable post-completion.
    //
    // We need a session cookie to hit guarded routes; sign in first.
    await page.goto('/login');
    await page.locator('#username').fill('admin@example.com');
    await page.locator('#password').fill('hunter22');
    await page.getByRole('button', { name: /^Sign in$/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });

    // Call /api/first-run/complete — idempotent; 200 regardless of prior state.
    const res = await page.request.post('/api/first-run/complete');
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);

    // Verify /first-run/status reports complete: true.
    const statusRes = await page.request.get('/api/first-run/status');
    expect(statusRes.ok()).toBe(true);
    const status = (await statusRes.json()) as { complete: boolean };
    expect(status.complete).toBe(true);

    // /library should now load without a first-run redirect.
    await page.goto('/library');
    await expect(page).not.toHaveURL(/\/first-run/);
  });
});
