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

test.describe('Auto-grab settings', () => {
  test('GET /api/settings/auto-grab returns defaults', async ({ page }) => {
    await signIn(page, 'admin', 'hunter22');
    const r = await page.request.get('/api/settings/auto-grab');
    expect(r.ok()).toBe(true);
    const body = (await r.json()) as { dryRun: boolean };
    expect(body.dryRun).toBe(false);
  });

  test('PATCH persists + emits audit row', async ({ page }) => {
    await signIn(page, 'admin', 'hunter22');
    const r = await page.request.patch('/api/settings/auto-grab', {
      data: { dryRun: true },
    });
    expect(r.ok()).toBe(true);
    const get = await page.request.get('/api/settings/auto-grab');
    const body = (await get.json()) as { dryRun: boolean };
    expect(body.dryRun).toBe(true);

    const audit = await page.request.get('/api/audit/events?action=settings.update&limit=10');
    const auditBody = (await audit.json()) as {
      rows: Array<{ targetId: string | null; metadataJson: string | null }>;
    };
    const row = auditBody.rows.find((r) => r.targetId === 'auto-grab');
    expect(row).toBeDefined();
    const meta = JSON.parse(row!.metadataJson!);
    expect(meta.changedFields).toContain('dryRun');
  });

  test('Non-admin gets 403', async ({ browser, page }) => {
    await signIn(page, 'admin', 'hunter22');
    const create = await page.request.post('/api/users', {
      data: {
        username: 'bob',
        password: 'hunter22',
        role: 'user',
        mustChangePassword: false,
      },
    });
    expect(create.ok()).toBe(true);

    const bobCtx = await browser.newContext();
    const bobPage = await bobCtx.newPage();
    await signIn(bobPage, 'bob', 'hunter22');

    const r = await bobPage.request.patch('/api/settings/auto-grab', {
      data: { dryRun: true },
    });
    expect(r.status()).toBe(403);

    await bobCtx.close();
  });

  test('Page renders for admin and redirects non-admin to /settings', async ({ browser, page }) => {
    await signIn(page, 'admin', 'hunter22');
    await page.goto('/settings/auto-grab');
    await expect(page).toHaveURL(/\/settings\/auto-grab$/);
    await expect(page.getByText('Dry-run mode', { exact: true })).toBeVisible();

    const bobCtx = await browser.newContext();
    const bobPage = await bobCtx.newPage();
    await signIn(bobPage, 'bob', 'hunter22');
    await bobPage.goto('/settings/auto-grab');
    await expect(bobPage).toHaveURL(/\/settings\/?$/);
    await bobCtx.close();
  });

  test('UI Save round-trip', async ({ page }) => {
    await signIn(page, 'admin', 'hunter22');
    // Reset to a known starting state via API (prior tests may have left dryRun=true).
    await page.request.patch('/api/settings/auto-grab', { data: { dryRun: false } });

    await page.goto('/settings/auto-grab');
    // Starting state: unchecked. Click to check, save, reload, verify checked.
    await expect(page.locator('#ag-dryrun')).not.toBeChecked();
    await page.locator('#ag-dryrun').click();
    await page.getByRole('button', { name: /^Save$/i }).click();
    await expect(page.getByText(/Saved auto-grab settings/i)).toBeVisible({
      timeout: 10_000,
    });
    await page.reload();
    await expect(page.locator('#ag-dryrun')).toBeChecked();
  });
});
