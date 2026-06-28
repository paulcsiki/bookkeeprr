/**
 * NOTE (P8 audit): No per-indexer test-connection endpoint exists.
 * There is no `/api/indexers/[id]/test`, `/api/indexers/[id]/ping`, or
 * similar route in the codebase. If a connectivity-check endpoint is added
 * in the future, extend this spec with a `'POST /api/indexers/[id]/test
 * returns connectivity result'` test using the mock-nyaa container
 * (happy path) and an unreachable host (sad path).
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

test.describe('Indexer CRUD', () => {
  test('POST /api/indexers creates a new indexer + emits audit row', async ({ page }) => {
    await signIn(page, 'admin', 'hunter22');
    const r = await page.request.post('/api/indexers', {
      data: {
        kind: 'nyaa',
        name: 'e2e-extra-nyaa',
        baseUrl: 'https://example.test',
        enabled: false,
        configJson: {
          kind: 'nyaa',
          queryTemplate: '{title}',
          contentTypes: ['manga'],
          categoryByContentType: { manga: '3_1' },
          pollIntervalSeconds: 900,
        },
      },
    });
    expect(r.status()).toBe(201);
    const body = (await r.json()) as { id: number };
    expect(body.id).toBeGreaterThan(0);

    const audit = await page.request.get('/api/audit/events?action=indexer.create&limit=10');
    const auditBody = (await audit.json()) as {
      rows: Array<{ targetId: string | null; metadataJson: string | null }>;
    };
    const row = auditBody.rows.find((r) => r.targetId === String(body.id));
    expect(row).toBeDefined();
    const meta = JSON.parse(row!.metadataJson!);
    expect(meta.kind).toBe('nyaa');
    expect(meta.name).toBe('e2e-extra-nyaa');
  });

  test('DELETE /api/indexers/[id] removes the row + emits audit row', async ({ page }) => {
    await signIn(page, 'admin', 'hunter22');

    // Create one first so we have something to delete.
    const create = await page.request.post('/api/indexers', {
      data: {
        kind: 'nyaa',
        name: 'e2e-to-delete',
        baseUrl: 'https://example.test',
        enabled: false,
        configJson: {
          kind: 'nyaa',
          queryTemplate: '{title}',
          contentTypes: ['manga'],
          categoryByContentType: { manga: '3_1' },
          pollIntervalSeconds: 900,
        },
      },
    });
    expect(create.status()).toBe(201);
    const { id } = (await create.json()) as { id: number };

    const del = await page.request.delete(`/api/indexers/${id}`);
    expect(del.ok()).toBe(true);

    // Verify the GET list no longer includes it.
    const list = await page.request.get('/api/indexers');
    const listBody = (await list.json()) as { indexers: Array<{ id: number }> };
    expect(listBody.indexers.find((i) => i.id === id)).toBeUndefined();

    const audit = await page.request.get('/api/audit/events?action=indexer.delete&limit=10');
    const auditBody = (await audit.json()) as {
      rows: Array<{ targetId: string | null; metadataJson: string | null }>;
    };
    const row = auditBody.rows.find((r) => r.targetId === String(id));
    expect(row).toBeDefined();
    const meta = JSON.parse(row!.metadataJson!);
    expect(meta.name).toBe('e2e-to-delete');
  });

  test('PATCH /api/indexers/[id] updates the enabled flag and persists', async ({ page }) => {
    await signIn(page, 'admin', 'hunter22');

    // Create a dedicated indexer to patch so we don't interfere with other tests.
    const create = await page.request.post('/api/indexers', {
      data: {
        kind: 'nyaa',
        name: 'e2e-patch-target',
        baseUrl: 'https://example.test',
        enabled: false,
        configJson: {
          kind: 'nyaa',
          queryTemplate: '{title}',
          contentTypes: ['manga'],
          categoryByContentType: { manga: '3_1' },
          pollIntervalSeconds: 900,
        },
      },
    });
    expect(create.status()).toBe(201);
    const { id } = (await create.json()) as { id: number };

    // Toggle enabled to true via PATCH.
    const patch = await page.request.patch(`/api/indexers/${id}`, {
      data: { enabled: true },
    });
    expect(patch.ok(), await patch.text()).toBe(true);

    // Verify the change persisted in the list.
    const list = await page.request.get('/api/indexers');
    expect(list.ok(), await list.text()).toBe(true);
    const listBody = (await list.json()) as { indexers: Array<{ id: number; enabled: boolean }> };
    const updated = listBody.indexers.find((i) => i.id === id);
    expect(updated, 'patched indexer should appear in list').toBeDefined();
    expect(updated!.enabled).toBe(true);
  });

  test('Non-admin gets 403 on POST and DELETE', async ({ browser, page }) => {
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

    const post = await bobPage.request.post('/api/indexers', {
      data: {
        kind: 'nyaa',
        name: 'bob-tries',
        baseUrl: 'https://example.test',
        enabled: false,
        configJson: {
          kind: 'nyaa',
          queryTemplate: '{title}',
          contentTypes: ['manga'],
          categoryByContentType: { manga: '3_1' },
          pollIntervalSeconds: 900,
        },
      },
    });
    expect(post.status()).toBe(403);

    const del = await bobPage.request.delete('/api/indexers/1');
    expect(del.status()).toBe(403);

    await bobCtx.close();
  });
});
