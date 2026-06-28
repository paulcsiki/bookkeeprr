import { test, expect } from '@playwright/test';
import { composeDownUp } from './fixtures/compose';
import { createFirstAdmin, signIn } from './helpers/auth';

test.describe.configure({ timeout: 180_000 });

const ADMIN = { username: 'admin', password: 'hunter22' };

// qBittorrent service from docker-compose.e2e.yml (auth disabled in its config).
const QBT = {
  host: 'qbittorrent',
  port: 8080,
  username: 'admin',
  password: 'adminadmin',
  useHttps: false,
} as const;

test.beforeAll(async ({ browser }) => {
  composeDownUp();

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await createFirstAdmin(page, ADMIN);
  await ctx.close();
});

test.describe('Downloads control endpoints', () => {
  test('GET /api/downloads returns an empty list on a fresh instance', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    const res = await page.request.get('/api/downloads');
    expect(res.ok(), await res.text()).toBe(true);
    const body = (await res.json()) as { downloads: unknown[] };
    expect(Array.isArray(body.downloads)).toBe(true);
    // Fresh instance — no downloads seeded.
    expect(body.downloads.length).toBe(0);
  });

  test('DELETE /api/downloads/[hash] returns 502 when qBt is not configured', async ({
    page,
  }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    // With no qBittorrent configured the route correctly returns 502, proving
    // the DELETE handler is wired at the expected path.
    const res = await page.request.delete('/api/downloads/deadbeefdeadbeef');
    // 502 = qBt not configured (not 404, which would mean the route is missing).
    expect(res.status()).toBe(502);
    const body = (await res.json()) as { message: string };
    expect(body.message).toMatch(/qBittorrent not configured/i);
  });

  test('POST /api/downloads/[hash]/pause returns 502 when qBt is not configured', async ({
    page,
  }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    const res = await page.request.post('/api/downloads/deadbeefdeadbeef/pause');
    expect(res.status()).toBe(502);
    const body = (await res.json()) as { message: string };
    expect(body.message).toMatch(/qBittorrent not configured/i);
  });

  test('POST /api/downloads/pause-all returns 502 when qBt is not configured', async ({
    page,
  }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    const res = await page.request.post('/api/downloads/pause-all');
    expect(res.status()).toBe(502);
    const body = (await res.json()) as { message: string };
    expect(body.message).toMatch(/qBittorrent not configured/i);
  });

  test('DELETE /api/downloads/[hash] + pause-all return ok when qBt is configured', async ({
    page,
  }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    // Configure qBittorrent using the compose service.
    const putRes = await page.request.put('/api/settings/qbt', { data: QBT });
    expect(putRes.status(), await putRes.text()).toBe(200);

    // DELETE on a non-existent hash: qBt accepts the call (no-op for unknown
    // hashes) and returns ok: true. This validates the full auth+qBt path.
    const delRes = await page.request.delete('/api/downloads/deadbeefdeadbeef');
    expect(delRes.status(), await delRes.text()).toBe(200);
    const delBody = (await delRes.json()) as { ok: boolean };
    expect(delBody.ok).toBe(true);

    // pause-all with qBt configured: 200 ok.
    const pauseAllRes = await page.request.post('/api/downloads/pause-all');
    expect(pauseAllRes.status(), await pauseAllRes.text()).toBe(200);
    const pauseAllBody = (await pauseAllRes.json()) as { ok: boolean };
    expect(pauseAllBody.ok).toBe(true);
  });
});
