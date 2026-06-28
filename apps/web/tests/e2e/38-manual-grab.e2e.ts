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

// Any syntactically valid btih magnet works: qBittorrent accepts the add and
// lists the torrent immediately (metaDL / stalled state — no peers needed for
// this test, we only assert the grab landed).
const HASH = 'fedcba9876543210fedcba9876543210fedcba98';
const MAGNET = `magnet:?xt=urn:btih:${HASH}&dn=Manual+E2E+Release`;

test.beforeAll(async ({ browser }) => {
  composeDownUp();

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await createFirstAdmin(page, ADMIN);
  await ctx.close();
});

test.describe('Manual torrent/magnet grab', () => {
  test('series detail → Add manually → magnet → download appears in qBt + /activity with MANUAL label', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await signIn(page, ADMIN.username, ADMIN.password);

    // 1. Configure qBittorrent (compose service).
    const putRes = await page.request.put('/api/settings/qbt', { data: QBT });
    expect(putRes.status(), await putRes.text()).toBe(200);

    // 2. Seed a series (needs the seeded quality profile).
    const profilesRes = await page.request.get('/api/quality-profiles');
    expect(profilesRes.ok()).toBe(true);
    const profiles = (await profilesRes.json()) as Array<{ id: number }>;
    expect(profiles.length, 'expected a seeded quality profile').toBeGreaterThan(0);

    const seriesRes = await page.request.post('/api/series', {
      data: {
        contentType: 'manga',
        titleEnglish: 'Manual Grab Series',
        titleRomaji: 'Manual Grab Series',
        status: 'releasing',
        rootPath: '/media/manga',
        qualityProfileId: profiles[0]!.id,
      },
    });
    expect(seriesRes.status(), await seriesRes.text()).toBeLessThan(400);
    const series = (await seriesRes.json()) as { id: number };

    // 3. Open the series detail and the Add-manually dialog.
    await page.goto(`/library/${series.id}`);
    await page.getByRole('button', { name: 'Add manually' }).click();

    // 4. Paste the magnet; the mono info-hash preview confirms client parsing.
    const magnetInput = page.getByLabel('Magnet link');
    await magnetInput.fill(MAGNET);
    await expect(page.getByText(`infohash ${HASH}`)).toBeVisible();

    await page.getByRole('button', { name: 'Add to downloads' }).click();
    await expect(page.getByText('Added to downloads')).toBeVisible({ timeout: 20_000 });

    // 5. The download row exists with the manual sentinel indexer.
    type DownloadsBody = {
      downloads: Array<{
        qbtHash: string | null;
        release: { title: string; indexerGuid: string; indexerKind: string | null } | null;
      }>;
    };
    const dlRes = await page.request.get('/api/downloads');
    expect(dlRes.ok(), await dlRes.text()).toBe(true);
    const dlBody = (await dlRes.json()) as DownloadsBody;
    const row = dlBody.downloads.find((d) => d.qbtHash?.toLowerCase() === HASH);
    expect(row, `expected a download row for ${HASH}`).toBeDefined();
    expect(row!.release?.title).toBe('Manual E2E Release'); // magnet dn=
    expect(row!.release?.indexerGuid).toBe(`manual:${HASH}`);
    expect(row!.release?.indexerKind).toBe('manual');

    // 6. The torrent actually landed in qBittorrent (host port 18090, auth
    //    bypassed in qBittorrent.conf — same pattern as 11-acquisition-pipeline).
    const qbtRes = await page.request.get('http://localhost:18090/api/v2/torrents/info');
    expect(qbtRes.ok(), await qbtRes.text()).toBe(true);
    const torrents = (await qbtRes.json()) as Array<{ hash: string }>;
    expect(
      torrents.some((t) => t.hash.toLowerCase() === HASH),
      `qBt torrents: ${JSON.stringify(torrents.map((t) => t.hash))}`,
    ).toBe(true);

    // 7. /activity shows the row with the MANUAL badge + the release title.
    await page.goto('/activity');
    await expect(page.getByText('Manual E2E Release')).toBeVisible();
    await expect(page.getByText('MANUAL', { exact: true })).toBeVisible();
  });

  test('re-adding the same magnet is rejected as a duplicate (409)', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    const seriesList = await page.request.get('/api/series');
    expect(seriesList.ok()).toBe(true);
    const sBody = (await seriesList.json()) as {
      rows: Array<{ id: number; titleEnglish: string | null }>;
    };
    const series = sBody.rows.find((s) => s.titleEnglish === 'Manual Grab Series');
    expect(series, 'first test should have created the series').toBeDefined();

    const res = await page.request.post(`/api/series/${series!.id}/manual-grab`, {
      data: { magnet: MAGNET },
    });
    expect(res.status(), await res.text()).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBeTruthy();
  });
});
