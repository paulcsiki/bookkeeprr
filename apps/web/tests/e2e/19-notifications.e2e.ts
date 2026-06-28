/**
 * Notifications settings e2e (Spec 19).
 *
 * 06-settings.e2e.ts already covers the PATCH round-trip + audit for
 * /api/settings/notifications. This spec adds:
 *   1. GET /api/settings/notifications returns the expected shape.
 *   2. POST /api/settings/notifications/test returns the defined result
 *      envelope for each channel (with no webhook configured, both channels
 *      should report 'not-configured').
 *
 * Route:  GET/PATCH /api/settings/notifications
 *         POST /api/settings/notifications/test
 */

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

test.describe('Notifications settings', () => {
  test('GET /api/settings/notifications returns expected shape with defaults', async ({ page }) => {
    await signIn(page, 'admin', 'hunter22');
    const r = await page.request.get('/api/settings/notifications');
    expect(r.ok(), await r.text()).toBe(true);
    const body = (await r.json()) as Record<string, unknown>;
    // Webhook fields should be null when unconfigured.
    expect(body.discordWebhookUrl).toBeNull();
    expect(body.discordWebhookConfigured).toBe(false);
    expect(body.appriseUrl).toBeNull();
    expect(body.appriseConfigured).toBe(false);
    // Event toggles should be present as booleans.
    expect(typeof body.eventGrabSuccess).toBe('boolean');
    expect(typeof body.eventImportSuccess).toBe('boolean');
    expect(typeof body.eventFailure).toBe('boolean');
  });

  test('POST /api/settings/notifications/test returns result envelope per channel', async ({
    page,
  }) => {
    await signIn(page, 'admin', 'hunter22');
    // With no webhook configured, both channels should report 'not-configured'.
    const r = await page.request.post('/api/settings/notifications/test');
    expect(r.ok(), await r.text()).toBe(true);
    const body = (await r.json()) as { discord: unknown; apprise: unknown };
    expect(body.discord).toBe('not-configured');
    expect(body.apprise).toBe('not-configured');
  });
});
