/**
 * Naming-engine settings e2e (Spec 18).
 *
 * Covers the naming-template API that drives how imported files get renamed.
 * Misconfigs cause silent damage to user libraries, so basic sanity coverage
 * is important.
 *
 * Route:  GET/PUT /api/settings/naming?contentType=<ct>
 * Defaults are defined in apps/web/src/server/naming/defaults.ts
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

test.describe('Naming settings', () => {
  test('GET /api/settings/naming returns defaults for all 5 content types', async ({ page }) => {
    await signIn(page, 'admin', 'hunter22');

    const expected: Record<string, Record<string, string>> = {
      manga: {
        series_folder: '{series_title}',
        volume: '{series_title} - v{volume:00} [{group}].{ext}',
        chapter: '{series_title} - c{chapter:000} [{group}].{ext}',
        batch: '{series_title} - c{chapter_range} [{group}].{ext}',
        volume_subfolder: '',
      },
      comic: {
        series_folder: '{publisher}/{series_title} ({series_year})',
        volume: '{series_title} v{volume:00} [{group}].{ext}',
        chapter: '{series_title} #{chapter:000} [{group}].{ext}',
        batch: '{series_title} #{chapter_range} [{group}].{ext}',
        volume_subfolder: '',
      },
      light_novel: {
        series_folder: '{author}/{series_title} Light Novel',
        volume: '{series_title} - v{volume:00} [{group}].{ext}',
        chapter: '{series_title} - c{chapter:000} [{group}].{ext}',
        batch: '{series_title} - c{chapter_range} [{group}].{ext}',
        volume_subfolder: '',
      },
      ebook: {
        series_folder: '{author}/{series_title}',
        volume: '{series_title} - v{volume:00} [{group}].{ext}',
        chapter: '{series_title} - c{chapter:000} [{group}].{ext}',
        batch: '{series_title} - c{chapter_range} [{group}].{ext}',
        volume_subfolder: '',
      },
      audiobook: {
        series_folder: '{author}/{series_title}',
        volume: '{series_title}.{ext}',
        chapter: '{series_title} - chapter {chapter}.{ext}',
        batch: '{series_title} - chapters {chapter_range}.{ext}',
        volume_subfolder: '',
      },
    };

    for (const [ct, expectedTemplates] of Object.entries(expected)) {
      const r = await page.request.get(`/api/settings/naming?contentType=${ct}`);
      expect(r.ok(), `GET naming failed for ${ct}: ${await r.text()}`).toBe(true);
      const body = (await r.json()) as { contentType: string; templates: Record<string, string> };
      expect(body.contentType).toBe(ct);
      expect(body.templates).toEqual(expectedTemplates);
    }
  });

  test('PUT /api/settings/naming persists a template change + emits audit row', async ({
    page,
  }) => {
    await signIn(page, 'admin', 'hunter22');

    // Change the series_folder template for comic content type.
    const r = await page.request.put('/api/settings/naming?contentType=comic', {
      data: {
        templates: {
          series_folder: '{series_title} ({series_year})',
        },
      },
    });
    expect(r.ok(), await r.text()).toBe(true);

    // Verify the change persisted.
    const get = await page.request.get('/api/settings/naming?contentType=comic');
    const body = (await get.json()) as { templates: Record<string, string> };
    expect(body.templates.series_folder).toBe('{series_title} ({series_year})');

    // Verify an audit event was emitted.
    const audit = await page.request.get('/api/audit/events?action=settings.update&limit=10');
    expect(audit.ok()).toBe(true);
    const auditBody = (await audit.json()) as {
      rows: Array<{ targetId: string | null; metadataJson: string | null }>;
    };
    const row = auditBody.rows.find((r) => r.targetId === 'naming');
    expect(row).toBeDefined();
    const meta = JSON.parse(row!.metadataJson!);
    expect(meta.contentType).toBe('comic');
    expect(meta.changedFields).toContain('series_folder');
  });

  test('/settings/naming page renders for admin', async ({ page }) => {
    await signIn(page, 'admin', 'hunter22');
    await page.goto('/settings/naming');
    await expect(page).toHaveURL(/\/settings\/naming/);
    await expect(page.getByRole('heading', { name: /Naming Templates/i })).toBeVisible();
  });
});
