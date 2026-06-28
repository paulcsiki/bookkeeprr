import { test, expect } from '@playwright/test';
import { composeDownUp } from './fixtures/compose';
import { createFirstAdmin, signIn } from './helpers/auth';

const ADMIN = { username: 'admin', password: 'Adminpassw0rd!' };
// The qBittorrent service in docker-compose.e2e.yml resolves at `qbittorrent`
// inside the bk-e2e bridge network. Its config disables WebUI auth, so any
// credentials bookkeeprr submits are accepted.
const QBT = {
  host: 'qbittorrent',
  port: 8080,
  username: 'admin',
  password: 'adminadmin',
  useHttps: false,
} as const;

/**
 * Acquisition-pipeline e2e (web).
 *
 * The full pipeline a user expects from bookkeeprr is:
 *
 *   1. Configure an indexer + a qBittorrent download client.
 *   2. Add a series.
 *   3. bookkeeprr polls the indexer, finds matching releases.
 *   4. bookkeeprr "grabs" the release → hands the .torrent / magnet to qBit.
 *   5. qBit downloads it.
 *   6. bookkeeprr's import job detects the completed download, renames + moves
 *      it under the library, marks the chapter/volume owned.
 *
 * This file is built up in slices that each ship as an independent test:
 *
 *   - Slice 1 (THIS FILE, today): real qBittorrent in compose; bookkeeprr can
 *     test the connection AND persist the connection settings. Proves the
 *     wiring + auth + container networking. (`bookkeeprr → qBit`)
 *
 *   - Slice 2 (next): a mock-newznab service in compose serving a small RSS
 *     feed pointing at a real WebSeed torrent (1 KB payload). bookkeeprr's
 *     grab path hands that torrent to qBit; qBit completes the download.
 *
 *   - Slice 3 (after): bookkeeprr's import job runs (or is triggered via API),
 *     organises the file under /media, and the library API reports the volume
 *     as owned. End-to-end happy path closed.
 */
test.describe('Acquisition pipeline — slice 1 (qBittorrent wiring)', () => {
  test.beforeAll(composeDownUp);

  test('test-connection succeeds against the real qBit container', async ({ page }) => {
    await createFirstAdmin(page, ADMIN);
    await signIn(page, ADMIN.username, ADMIN.password);

    const r = await page.request.post('/api/qbt/test-connection', { data: QBT });
    expect(r.status(), await r.text()).toBe(200);
    const body = (await r.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  test('PUT /api/settings/qbt persists + GET round-trips (password masked)', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    const put = await page.request.put('/api/settings/qbt', { data: QBT });
    expect(put.status(), await put.text()).toBe(200);

    const get = await page.request.get('/api/settings/qbt');
    expect(get.ok()).toBe(true);
    const body = (await get.json()) as typeof QBT & { password: string };
    expect(body.host).toBe(QBT.host);
    expect(body.port).toBe(QBT.port);
    expect(body.username).toBe(QBT.username);
    expect(body.useHttps).toBe(QBT.useHttps);
    // The route masks a non-empty password as '****' on read.
    expect(body.password).toBe('****');
  });

  test('test-connection rejects an unreachable host with 502', async ({ page }) => {
    await signIn(page, ADMIN.username, ADMIN.password);

    const r = await page.request.post('/api/qbt/test-connection', {
      data: { ...QBT, host: 'nowhere.invalid' },
    });
    expect(r.status()).toBe(502);
    const body = (await r.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBeTruthy();
  });
});

test.describe('Acquisition pipeline — slice 2 (full grab + WebSeed download)', () => {
  // Slice 2 runs against the compose stack started by slice 1's beforeAll;
  // the `mock-nyaa` service publishes a 1-item RSS feed that points qBit at
  // a WebSeed payload (no peers needed), so a release flows end-to-end:
  // indexer search → match → upsert → grab → qBit download via HTTP.

  test('end-to-end: configure → search → grab → qBit reports download complete', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await signIn(page, ADMIN.username, ADMIN.password);

    // 1. Persist qBit + register the mock-nyaa indexer.
    expect((await page.request.put('/api/settings/qbt', { data: QBT })).status()).toBe(200);

    const idxRes = await page.request.post('/api/indexers', {
      data: {
        kind: 'nyaa',
        name: 'mock-nyaa',
        baseUrl: 'http://mock-nyaa:8080',
        enabled: true,
        configJson: {
          kind: 'nyaa',
          queryTemplate: '{title}',
          contentTypes: ['manga'],
          categoryByContentType: { manga: '3_1' },
          pollIntervalSeconds: 60,
        },
      },
    });
    expect(idxRes.status(), await idxRes.text()).toBeLessThan(400);

    // 2. Need a quality profile to attach the series to. Most envs ship a
    // seeded "Default" profile; pick whichever is first.
    const profilesRes = await page.request.get('/api/quality-profiles');
    expect(profilesRes.ok()).toBe(true);
    const profiles = (await profilesRes.json()) as Array<{ id: number }>;
    expect(profiles.length, 'expected a seeded quality profile').toBeGreaterThan(0);
    const qualityProfileId = profiles[0]!.id;

    // 3. Create a series matching the mock-nyaa release title
    //    ("Mock Test Series v01 (2024) ...") so the matcher accepts it.
    const seriesRes = await page.request.post('/api/series', {
      data: {
        contentType: 'manga',
        titleEnglish: 'Mock Test Series',
        titleRomaji: 'Mock Test Series',
        status: 'releasing',
        rootPath: '/media/manga',
        qualityProfileId,
      },
    });
    expect(seriesRes.status(), await seriesRes.text()).toBeLessThan(400);
    const series = (await seriesRes.json()) as { id: number };

    // 4. Interactive-search drives a live Nyaa fetch (via the real Nyaa
    //    client + the indexer's baseUrl, now wired) → matcher → upsert.
    const searchRes = await page.request.post('/api/search/interactive', {
      data: { seriesId: series.id },
    });
    expect(searchRes.ok(), await searchRes.text()).toBe(true);

    // 5. Pull the persisted release row and trigger grab.
    const relList = await page.request.get(`/api/series/${series.id}/releases`);
    expect(relList.ok()).toBe(true);
    const relBody = (await relList.json()) as { releases: Array<{ id: number; title: string }> };
    expect(relBody.releases.length, 'expected at least one matched release').toBeGreaterThan(0);
    const releaseId = relBody.releases[0]!.id;

    const grabRes = await page.request.post(`/api/releases/${releaseId}/grab`);
    expect(grabRes.status(), await grabRes.text()).toBe(201);

    // 6. qBit is exposed on host port 18090. Auth bypass is configured in
    //    qBittorrent.conf so we can hit the API without a session.
    const qbtBase = 'http://localhost:18090';
    const deadline = Date.now() + 40_000;
    let done = false;
    let last: unknown = null;
    while (Date.now() < deadline) {
      const r = await page.request.get(`${qbtBase}/api/v2/torrents/info`);
      if (r.ok()) {
        const list = (await r.json()) as Array<{
          name: string;
          progress: number;
          state: string;
          size: number;
          downloaded: number;
        }>;
        last = list;
        if (list.some((t) => t.progress >= 1 || ['uploading', 'stalledUP', 'pausedUP'].includes(t.state))) {
          done = true;
          break;
        }
      }
      await page.waitForTimeout(500);
    }
    expect(done, `qBit did not finish the download within 40s. last torrents.info: ${JSON.stringify(last)}`).toBe(true);
  });
});

test.describe('Acquisition pipeline — slice 3 (import → organize → library reports owned)', () => {
  // Slice 3 continues from slice 2's state: qBit has the torrent downloaded,
  // bookkeeprr has the release row + the in-flight download. Now we trigger
  // qbt-watch (so the download is marked completed and an import job is
  // enqueued), then import (which copies the file under the library root and
  // writes the library_files row that flips release ownership to
  // `in-library`).

  test('triggers qbt_watch + import → release ownership flips to in-library', async ({ page }) => {
    test.setTimeout(60_000);
    await signIn(page, ADMIN.username, ADMIN.password);

    // Find the series created in slice 2.
    const seriesList = await page.request.get('/api/series');
    expect(seriesList.ok()).toBe(true);
    const sBody = (await seriesList.json()) as {
      rows: Array<{ id: number; titleEnglish: string | null }>;
    };
    const series = sBody.rows.find((s) => s.titleEnglish === 'Mock Test Series');
    expect(series, 'slice 2 should have created the series').toBeDefined();
    const seriesId = series!.id;

    // The importer requires a matching volume row (the torrent parses to
    // volume 1). Real installs get this from metadata-hydrate; the e2e
    // seeds it explicitly via the admin volumes endpoint.
    const seedVols = await page.request.post(`/api/series/${seriesId}/volumes`, {
      data: { from: 1, to: 1 },
    });
    expect(seedVols.status(), await seedVols.text()).toBe(201);

    // Run qbt_watch: sees the completed torrent in qBit, marks the download
    // 'completed', and enqueues an import job.
    const watch = await page.request.post('/api/jobs/run', { data: { kind: 'qbt_watch' } });
    expect(watch.status(), await watch.text()).toBe(200);

    // Run import: copies the file from /media/downloads → /media and inserts
    // library_files with volumeId set.
    const imp = await page.request.post('/api/jobs/run', { data: { kind: 'import' } });
    expect(imp.status(), await imp.text()).toBe(200);

    // The release now belongs to the library — poll a brief window in case
    // the qbt_watch → import handoff takes a moment.
    const deadline = Date.now() + 15_000;
    let owned = false;
    let lastOwnership: string | null = null;
    while (Date.now() < deadline) {
      const rel = await page.request.get(`/api/series/${seriesId}/releases`);
      if (rel.ok()) {
        const body = (await rel.json()) as {
          releases: Array<{ id: number; ownership: string }>;
        };
        const r = body.releases[0];
        if (r) {
          lastOwnership = r.ownership;
          if (r.ownership === 'in-library') {
            owned = true;
            break;
          }
        }
      }
      await page.waitForTimeout(500);
    }
    expect(owned, `release ownership did not become in-library (last: ${lastOwnership})`).toBe(true);
  });
});
