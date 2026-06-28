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

test.describe('Housekeeping settings', () => {
  test('GET /api/settings/housekeeping returns all four sections with defaults', async ({
    page,
  }) => {
    await signIn(page, 'admin', 'hunter22');
    const r = await page.request.get('/api/settings/housekeeping');
    expect(r.ok()).toBe(true);
    const body = (await r.json()) as Record<string, Record<string, number>>;
    expect(body.jobs).toEqual({ terminalDays: 30, errorDays: 90 });
    expect(body.backups).toEqual({ daily: 14, monthlyDay1: 12 });
    expect(body.visibility).toEqual({ auditRetentionDays: 30, logRetentionDays: 7 });
    expect(body.releases).toEqual({ keepPerSeries: 30, olderThanDays: 90 });
  });

  test('PATCH /jobs persists + emits audit row', async ({ page }) => {
    await signIn(page, 'admin', 'hunter22');
    const r = await page.request.patch('/api/settings/housekeeping/jobs', {
      data: { terminalDays: 14, errorDays: 60 },
    });
    expect(r.ok()).toBe(true);
    const get = await page.request.get('/api/settings/housekeeping');
    const body = (await get.json()) as { jobs: { terminalDays: number; errorDays: number } };
    expect(body.jobs).toEqual({ terminalDays: 14, errorDays: 60 });
    const audit = await page.request.get('/api/audit/events?action=settings.update&limit=10');
    const auditBody = (await audit.json()) as {
      rows: Array<{ targetId: string | null; metadataJson: string | null }>;
    };
    const row = auditBody.rows.find((r) => r.targetId === 'housekeeping-jobs');
    expect(row).toBeDefined();
    const meta = JSON.parse(row!.metadataJson!);
    expect(meta.changedFields).toContain('terminalDays');
    expect(meta.changedFields).toContain('errorDays');
  });

  test('PATCH /backups persists + emits audit row', async ({ page }) => {
    await signIn(page, 'admin', 'hunter22');
    const r = await page.request.patch('/api/settings/housekeeping/backups', {
      data: { daily: 7, monthlyDay1: 6 },
    });
    expect(r.ok()).toBe(true);
    const get = await page.request.get('/api/settings/housekeeping');
    const body = (await get.json()) as { backups: { daily: number; monthlyDay1: number } };
    expect(body.backups).toEqual({ daily: 7, monthlyDay1: 6 });
    const audit = await page.request.get('/api/audit/events?action=settings.update&limit=10');
    const auditBody = (await audit.json()) as {
      rows: Array<{ targetId: string | null; metadataJson: string | null }>;
    };
    const row = auditBody.rows.find((r) => r.targetId === 'housekeeping-backups');
    expect(row).toBeDefined();
    const meta = JSON.parse(row!.metadataJson!);
    expect(meta.changedFields).toContain('daily');
    expect(meta.changedFields).toContain('monthlyDay1');
  });

  test('PATCH /visibility persists + emits audit row', async ({ page }) => {
    await signIn(page, 'admin', 'hunter22');
    const r = await page.request.patch('/api/settings/housekeeping/visibility', {
      data: { auditRetentionDays: 60, logRetentionDays: 14 },
    });
    expect(r.ok()).toBe(true);
    const audit = await page.request.get('/api/audit/events?action=settings.update&limit=10');
    const auditBody = (await audit.json()) as {
      rows: Array<{ targetId: string | null; metadataJson: string | null }>;
    };
    const row = auditBody.rows.find((r) => r.targetId === 'housekeeping-visibility');
    expect(row).toBeDefined();
    const meta = JSON.parse(row!.metadataJson!);
    expect(meta.changedFields).toContain('auditRetentionDays');
    expect(meta.changedFields).toContain('logRetentionDays');
  });

  test('PATCH /releases persists + emits audit row', async ({ page }) => {
    await signIn(page, 'admin', 'hunter22');
    const r = await page.request.patch('/api/settings/housekeeping/releases', {
      data: { keepPerSeries: 40, olderThanDays: 120 },
    });
    expect(r.ok()).toBe(true);
    const audit = await page.request.get('/api/audit/events?action=settings.update&limit=10');
    const auditBody = (await audit.json()) as {
      rows: Array<{ targetId: string | null; metadataJson: string | null }>;
    };
    const row = auditBody.rows.find((r) => r.targetId === 'housekeeping-releases');
    expect(row).toBeDefined();
    const meta = JSON.parse(row!.metadataJson!);
    expect(meta.changedFields).toContain('keepPerSeries');
    expect(meta.changedFields).toContain('olderThanDays');
  });

  test('Invalid body returns 422', async ({ page }) => {
    await signIn(page, 'admin', 'hunter22');
    const r = await page.request.patch('/api/settings/housekeeping/jobs', {
      data: { terminalDays: -5 },
    });
    expect(r.status()).toBe(422);
  });

  test('Non-admin gets 403', async ({ browser, page }) => {
    // Create a normal user via the admin's session.
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

    // Sign in as bob in a fresh context.
    const bobCtx = await browser.newContext();
    const bobPage = await bobCtx.newPage();
    await signIn(bobPage, 'bob', 'hunter22');
    const r = await bobPage.request.patch('/api/settings/housekeeping/jobs', {
      data: { terminalDays: 14 },
    });
    expect(r.status()).toBe(403);
    await bobCtx.close();
  });

  test('Page renders for admin and redirects non-admin to /settings', async ({ browser, page }) => {
    await signIn(page, 'admin', 'hunter22');
    await page.goto('/settings/housekeeping');
    await expect(page).toHaveURL(/\/settings\/housekeeping$/);
    await expect(page.getByRole('heading', { name: /Housekeeping/i })).toBeVisible();
    await expect(page.getByText('Jobs', { exact: true })).toBeVisible();
    await expect(page.getByText('Database backups', { exact: true })).toBeVisible();
    await expect(page.getByText('Audit + logs', { exact: true })).toBeVisible();
    await expect(page.getByText('Releases', { exact: true })).toBeVisible();

    // Sign in as bob (created in the previous test); navigate to /settings/housekeeping → /settings.
    const bobCtx = await browser.newContext();
    const bobPage = await bobCtx.newPage();
    await signIn(bobPage, 'bob', 'hunter22');
    await bobPage.goto('/settings/housekeeping');
    await expect(bobPage).toHaveURL(/\/settings\/?$/);
    await bobCtx.close();
  });

  test('UI Save round-trip on the Releases card', async ({ page }) => {
    await signIn(page, 'admin', 'hunter22');
    await page.goto('/settings/housekeeping');
    await page.locator('#hk-rel-keep').fill('50');
    await page.getByRole('button', { name: /^Save releases$/i }).click();
    await expect(page.getByText(/Saved releases retention/i)).toBeVisible({
      timeout: 10_000,
    });
    await page.reload();
    await expect(page.locator('#hk-rel-keep')).toHaveValue('50');
  });
});
