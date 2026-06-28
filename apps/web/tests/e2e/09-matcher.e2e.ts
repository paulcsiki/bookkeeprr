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

test.describe('Matcher settings', () => {
  test('GET /api/settings/matcher returns defaults', async ({ page }) => {
    await signIn(page, 'admin', 'hunter22');
    const r = await page.request.get('/api/settings/matcher');
    expect(r.ok()).toBe(true);
    const body = (await r.json()) as Record<string, Record<string, unknown>>;
    expect(body.weights).toEqual({
      groupTopWeight: 100,
      groupStepDown: 10,
      batchBonus: 30,
      seederMultiplier: 5,
      trustedBonus: 10,
      remakePenalty: -15,
    });
    expect(body.adultFilter).toEqual({
      enabled: true,
      blockedCategories: ['4_1', '4_2', '4_3', '4_4'],
    });
  });

  test('PATCH /weights persists + emits audit row', async ({ page }) => {
    await signIn(page, 'admin', 'hunter22');
    const r = await page.request.patch('/api/settings/matcher/weights', {
      data: { seederMultiplier: 8, trustedBonus: 20 },
    });
    expect(r.ok()).toBe(true);
    const get = await page.request.get('/api/settings/matcher');
    const body = (await get.json()) as {
      weights: { seederMultiplier: number; trustedBonus: number };
    };
    expect(body.weights.seederMultiplier).toBe(8);
    expect(body.weights.trustedBonus).toBe(20);

    const audit = await page.request.get('/api/audit/events?action=settings.update&limit=10');
    const auditBody = (await audit.json()) as {
      rows: Array<{ targetId: string | null; metadataJson: string | null }>;
    };
    const row = auditBody.rows.find((r) => r.targetId === 'matcher-weights');
    expect(row).toBeDefined();
    const meta = JSON.parse(row!.metadataJson!);
    expect(meta.changedFields).toContain('seederMultiplier');
    expect(meta.changedFields).toContain('trustedBonus');
  });

  test('PATCH /adult-filter persists + emits audit row', async ({ page }) => {
    await signIn(page, 'admin', 'hunter22');
    const r = await page.request.patch('/api/settings/matcher/adult-filter', {
      data: { enabled: false, blockedCategories: ['4_1'] },
    });
    expect(r.ok()).toBe(true);

    const audit = await page.request.get('/api/audit/events?action=settings.update&limit=10');
    const auditBody = (await audit.json()) as {
      rows: Array<{ targetId: string | null; metadataJson: string | null }>;
    };
    const row = auditBody.rows.find((r) => r.targetId === 'matcher-adult-filter');
    expect(row).toBeDefined();
    const meta = JSON.parse(row!.metadataJson!);
    expect(meta.changedFields).toContain('enabled');
    expect(meta.changedFields).toContain('blockedCategories');
  });

  test('Invalid weights body returns 422', async ({ page }) => {
    await signIn(page, 'admin', 'hunter22');
    const r = await page.request.patch('/api/settings/matcher/weights', {
      data: { seederMultiplier: 9999 },
    });
    expect(r.status()).toBe(422);
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

    const r = await bobPage.request.patch('/api/settings/matcher/weights', {
      data: { seederMultiplier: 7 },
    });
    expect(r.status()).toBe(403);

    await bobCtx.close();
  });

  test('Page renders for admin and redirects non-admin to /settings', async ({ browser, page }) => {
    await signIn(page, 'admin', 'hunter22');
    await page.goto('/settings/matcher');
    await expect(page).toHaveURL(/\/settings\/matcher$/);
    await expect(page.getByText('Scoring weights', { exact: true })).toBeVisible();
    await expect(page.getByText('Adult content filter', { exact: true })).toBeVisible();

    const bobCtx = await browser.newContext();
    const bobPage = await bobCtx.newPage();
    await signIn(bobPage, 'bob', 'hunter22');
    await bobPage.goto('/settings/matcher');
    await expect(bobPage).toHaveURL(/\/settings\/?$/);
    await bobCtx.close();
  });

  test('UI Save round-trip on the Weights card', async ({ page }) => {
    await signIn(page, 'admin', 'hunter22');
    await page.goto('/settings/matcher');
    await page.locator('#mw-seeders').fill('9');
    await page.getByRole('button', { name: /^Save weights$/i }).click();
    await expect(page.getByText(/Saved weights settings/i)).toBeVisible({ timeout: 10_000 });
    await page.reload();
    await expect(page.locator('#mw-seeders')).toHaveValue('9');
  });
});
