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

test.describe('Audit events API', () => {
  test('GET /api/audit/events returns recent events', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    // Trigger an auditable action: patch housekeeping/jobs settings.
    const patch = await page.request.patch('/api/settings/housekeeping/jobs', {
      data: { terminalDays: 20, errorDays: 75 },
    });
    expect(patch.ok(), `housekeeping PATCH failed: ${await patch.text()}`).toBe(true);

    // Fetch the audit log — should contain at least one event.
    const res = await page.request.get('/api/audit/events?limit=50');
    expect(res.ok(), `audit GET failed: ${await res.text()}`).toBe(true);

    const body = (await res.json()) as {
      rows: Array<{
        id: number;
        timestamp: string;
        actorKind: string;
        actorUserId: number | null;
        actorUsername: string | null;
        action: string;
        targetKind: string | null;
        targetId: string | null;
        metadataJson: string | null;
        peerIp: string | null;
        clientIp: string | null;
        userAgent: string | null;
      }>;
      total: number;
    };

    expect(body.rows).toBeDefined();
    expect(Array.isArray(body.rows)).toBe(true);
    expect(body.rows.length).toBeGreaterThan(0);
    expect(typeof body.total).toBe('number');
    expect(body.total).toBeGreaterThan(0);

    // Verify row shape on the first returned event.
    const first = body.rows[0]!;
    expect(typeof first.id).toBe('number');
    expect(typeof first.action).toBe('string');
    expect(typeof first.actorKind).toBe('string');

    // The most recent event should be the settings.update we just triggered.
    const settingsRow = body.rows.find((r) => r.action === 'settings.update' && r.targetId === 'housekeeping-jobs');
    expect(settingsRow, 'expected a settings.update row for housekeeping-jobs').toBeDefined();
  });

  test('GET /api/audit/events?actionPrefix=auth. filters to auth events only', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    // Fetch with actionPrefix filter.
    const res = await page.request.get('/api/audit/events?actionPrefix=auth.&limit=50');
    expect(res.ok(), `audit GET with actionPrefix failed: ${await res.text()}`).toBe(true);

    const body = (await res.json()) as {
      rows: Array<{ action: string }>;
      total: number;
    };

    expect(body.rows).toBeDefined();
    expect(Array.isArray(body.rows)).toBe(true);
    // Every row must have an action starting with "auth."
    for (const row of body.rows) {
      expect(row.action).toMatch(/^auth\./);
    }
    // Login itself emits auth.login_success, so there is at least one auth row.
    expect(body.rows.length).toBeGreaterThan(0);
  });

  test('audit log limit + offset pagination returns correct slices', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    // Trigger several auditable actions so there are enough rows to paginate.
    for (let i = 0; i < 3; i++) {
      await page.request.patch('/api/settings/housekeeping/jobs', {
        data: { terminalDays: 20 + i, errorDays: 75 },
      });
    }

    // Fetch the full set (up to 200) to know the total.
    const allRes = await page.request.get('/api/audit/events?limit=200&offset=0');
    expect(allRes.ok(), `audit GET full failed: ${await allRes.text()}`).toBe(true);
    const allBody = (await allRes.json()) as { rows: Array<{ id: number }>; total: number };
    const total = allBody.total;

    // Skip pagination test if there aren't enough events to produce two pages.
    if (total < 2) {
      // Not enough rows to test pagination — skip gracefully.
      return;
    }

    // Page 1: first 1 row.
    const page1Res = await page.request.get('/api/audit/events?limit=1&offset=0');
    expect(page1Res.ok(), `audit page1 failed: ${await page1Res.text()}`).toBe(true);
    const page1 = (await page1Res.json()) as { rows: Array<{ id: number }>; total: number };

    expect(page1.rows.length).toBe(1);
    expect(page1.total).toBe(total); // total is the unfiltered count, not the page size

    // Page 2: second row via offset=1.
    const page2Res = await page.request.get('/api/audit/events?limit=1&offset=1');
    expect(page2Res.ok(), `audit page2 failed: ${await page2Res.text()}`).toBe(true);
    const page2 = (await page2Res.json()) as { rows: Array<{ id: number }>; total: number };

    expect(page2.rows.length).toBe(1);
    expect(page2.total).toBe(total);

    // The two pages must return different rows.
    expect(page1.rows[0]!.id).not.toBe(page2.rows[0]!.id);
  });
});
