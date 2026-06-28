import { test, expect } from '@playwright/test';
import { composeDownUp } from './fixtures/compose';
import { createFirstAdmin, signIn } from './helpers/auth';
import { apiKeyDirect } from './helpers/api';

test.describe.configure({ timeout: 180_000 });

test.beforeAll(async ({ browser }) => {
  composeDownUp();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await createFirstAdmin(page, { username: 'admin', password: 'hunter22' });
  await ctx.close();
});

test.describe('Settings smoke', () => {
  test('PATCH /api/settings/notifications persists + emits audit', async ({ page }) => {
    await signIn(page, 'admin', 'hunter22');
    const r = await page.request.patch('/api/settings/notifications', {
      data: {
        discordWebhookUrl: 'https://discord.com/api/webhooks/123/abc',
        discordUsername: 'bookkeeprr',
        discordAvatarUrl: null,
        appriseUrl: null,
        eventGrabSuccess: true,
        eventImportSuccess: true,
        eventFailure: true,
      },
    });
    expect(r.ok()).toBe(true);
    // Audit row emitted with changedFields containing discordWebhookUrl.
    const audit = await page.request.get('/api/audit/events?action=settings.update&limit=10');
    expect(audit.ok()).toBe(true);
    const auditBody = (await audit.json()) as {
      rows: Array<{ targetId: string | null; metadataJson: string | null }>;
    };
    const notif = auditBody.rows.find((r) => r.targetId === 'notifications');
    expect(notif).toBeDefined();
    const meta = JSON.parse(notif!.metadataJson!);
    expect(meta.changedFields).toContain('discordWebhookUrl');
  });

  test('API key generate → use → disable cycle', async ({ page }) => {
    await signIn(page, 'admin', 'hunter22');
    // PATCH with action: 'generate'.
    const gen = await page.request.patch('/api/settings/api-key', {
      data: { action: 'generate' },
    });
    expect(gen.ok()).toBe(true);
    const genBody = (await gen.json()) as { enabled: boolean; key: string };
    expect(genBody.enabled).toBe(true);
    expect(genBody.key.length).toBeGreaterThan(10);
    const key = genBody.key;
    // Use against the readarr surface (which gates on X-Api-Key). /api/users uses
    // session-cookie admin gate, not X-Api-Key.
    const used = await apiKeyDirect('/api/readarr/v1/book', key);
    expect(used.ok).toBe(true);
    // Disable.
    const dis = await page.request.patch('/api/settings/api-key', {
      data: { action: 'disable' },
    });
    expect(dis.ok()).toBe(true);
    // Old key no longer authenticates.
    const after = await apiKeyDirect('/api/readarr/v1/book', key);
    expect(after.status).toBe(401);
  });
});
