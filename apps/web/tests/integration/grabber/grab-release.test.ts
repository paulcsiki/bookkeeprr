import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { seedDefaultIndexer } from '@/server/db/indexers';
import { upsertReleaseByGuid } from '@/server/db/releases';
import { insertDownload } from '@/server/db/downloads';
import { qbtConnectionSetting } from '@/server/db/settings/qbt';
import { contentTypePathsSetting } from '@/server/db/settings/library';
import { grabRelease } from '@/server/grabber';
import {
  __setQbtFetcherForTests,
  __resetQbtForTests,
} from '@/server/integrations/qbittorrent/client';

let h: SeedHandle;
let releaseId: number;

const HASH = 'abcdef0123456789abcdef0123456789abcdef01';
const MAGNET = `magnet:?xt=urn:btih:${HASH}`;

beforeEach(async () => {
  h = await seedDb();
  await seedDefaultIndexer();
  releaseId = await upsertReleaseByGuid({
    indexerId: 1,
    indexerGuid: 'g1',
    seriesId: h.seriesId,
    title: 't',
    link: MAGNET,
    targetKind: 'volume',
    targetLow: 1,
    targetHigh: 1,
    sizeBytes: 0,
    publishedAt: new Date(),
  });
  await qbtConnectionSetting.set({
    host: 'x',
    port: 1,
    username: 'u',
    password: 'p',
    useHttps: false,
  });
  __resetQbtForTests();
});

afterEach(() => h.cleanup());

function mockHappy(): void {
  __setQbtFetcherForTests(async (url) => {
    if (url.endsWith('/api/v2/auth/login')) {
      return {
        ok: true,
        status: 200,
        headers: { 'set-cookie': 'SID=abc' },
        text: async () => 'Ok.',
      };
    }
    if (url.endsWith('/torrents/add')) {
      return { ok: true, status: 200, headers: {}, text: async () => 'Ok.' };
    }
    if (url.includes('/torrents/info')) {
      return {
        ok: true,
        status: 200,
        headers: {},
        text: async () =>
          JSON.stringify([
            {
              hash: HASH,
              name: 'x',
              state: 'downloading',
              progress: 0,
              category: 'bookkeeprr-manga',
              tags: '',
              save_path: '/x',
              size: 0,
              completed: 0,
            },
          ]),
      };
    }
    throw new Error(`unexpected ${url}`);
  });
}

describe('grabRelease', () => {
  it('returns ok with downloadId + qbtHash on happy path', async () => {
    mockHappy();
    const r = await grabRelease(releaseId);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.qbtHash).toBe(HASH);
      expect(r.result.downloadId).toBeGreaterThan(0);
    }
  });

  it('returns not-found for missing release', async () => {
    const r = await grabRelease(99999);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('not-found');
  });

  it('returns orphaned when release has null seriesId', async () => {
    const { deleteSeries } = await import('@/server/db/series');
    await deleteSeries(h.seriesId);
    const r = await grabRelease(releaseId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('orphaned');
  });

  it('returns already-grabbed when active download exists', async () => {
    await insertDownload({ releaseId, qbtHash: HASH, status: 'queued' });
    mockHappy();
    const r = await grabRelease(releaseId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('already-grabbed');
  });

  // Regression: the "Abhorsen Trilogy" re-grab loop. The same physical torrent
  // can exist as two release rows (one per indexer). When the first is grabbed,
  // health-check-rejected, and its failed download row keeps the torrent's hash,
  // grabbing the TWIN must NOT throw `UNIQUE constraint failed: downloads.qbt_hash`
  // (which escaped the grab bookkeeping and re-fetched the link — re-notifying the
  // indexer — every poll cycle forever).
  it('treats a hash already owned by another rejected release as duplicate-grab and rejects this release', async () => {
    const { markReleaseRejected, getRelease } = await import('@/server/db/releases');
    // releaseId (g1) is the rejected twin: failed download keeps the hash.
    await insertDownload({ releaseId, qbtHash: HASH, status: 'failed' });
    await markReleaseRejected(releaseId, 'missing');
    // The not-yet-rejected twin on another indexer, same magnet → same hash.
    const twinId = await upsertReleaseByGuid({
      indexerId: 1,
      indexerGuid: 'g-twin',
      seriesId: h.seriesId,
      title: 't',
      link: MAGNET,
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      sizeBytes: 0,
      publishedAt: new Date(),
    });
    mockHappy();
    const r = await grabRelease(twinId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('duplicate-grab');
    // The twin is now permanently excluded so the loop can't recur.
    const twin = await getRelease(twinId);
    expect(twin?.rejectedAt).not.toBeNull();
  });

  it('treats a hash owned by an active download under another release as already-grabbed', async () => {
    await insertDownload({ releaseId, qbtHash: HASH, status: 'downloading' });
    const twinId = await upsertReleaseByGuid({
      indexerId: 1,
      indexerGuid: 'g-twin2',
      seriesId: h.seriesId,
      title: 't',
      link: MAGNET,
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      sizeBytes: 0,
      publishedAt: new Date(),
    });
    mockHappy();
    const r = await grabRelease(twinId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('already-grabbed');
  });

  it('returns not-configured when qbt is empty', async () => {
    await qbtConnectionSetting.set({
      host: '',
      port: 8080,
      username: '',
      password: '',
      useHttps: false,
    });
    mockHappy();
    const r = await grabRelease(releaseId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('not-configured');
  });

  it('returns malformed-link for non-magnet non-http link', async () => {
    const { upsertReleaseByGuid: upsert } = await import('@/server/db/releases');
    const badId = await upsert({
      indexerId: 1,
      indexerGuid: 'g-bad',
      seriesId: h.seriesId,
      title: 't',
      link: 'gibberish',
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      sizeBytes: 0,
      publishedAt: new Date(),
    });
    mockHappy();
    const r = await grabRelease(badId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('malformed-link');
  });

  it('returns qbt-add-failed when add returns Fails.', async () => {
    __setQbtFetcherForTests(async (url) => {
      if (url.endsWith('/api/v2/auth/login')) {
        return {
          ok: true,
          status: 200,
          headers: { 'set-cookie': 'SID=abc' },
          text: async () => 'Ok.',
        };
      }
      return { ok: true, status: 200, headers: {}, text: async () => 'Fails.' };
    });
    const r = await grabRelease(releaseId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('qbt-add-failed');
  });

  it('uses the configured per-type category for add and info list', async () => {
    await contentTypePathsSetting.set({
      manga: { libraryRoot: '', qbtCategory: 'my-manga' },
      comic: { libraryRoot: '', qbtCategory: '' },
      light_novel: { libraryRoot: '', qbtCategory: '' },
      ebook: { libraryRoot: '', qbtCategory: '' },
      audiobook: { libraryRoot: '', qbtCategory: '' },
    });
    const addCategories: (string | null)[] = [];
    const infoCategories: (string | null)[] = [];
    __setQbtFetcherForTests(async (url, init) => {
      if (url.endsWith('/api/v2/auth/login')) {
        return {
          ok: true,
          status: 200,
          headers: { 'set-cookie': 'SID=abc' },
          text: async () => 'Ok.',
        };
      }
      if (url.endsWith('/torrents/add')) {
        const body = init?.body;
        const cat = body instanceof FormData ? body.get('category') : null;
        addCategories.push(typeof cat === 'string' ? cat : null);
        return { ok: true, status: 200, headers: {}, text: async () => 'Ok.' };
      }
      if (url.includes('/torrents/info')) {
        infoCategories.push(new URL(url).searchParams.get('category'));
        return {
          ok: true,
          status: 200,
          headers: {},
          text: async () =>
            JSON.stringify([
              {
                hash: HASH,
                name: 'x',
                state: 'downloading',
                progress: 0,
                category: 'my-manga',
                tags: '',
                save_path: '/x',
                size: 0,
                completed: 0,
              },
            ]),
        };
      }
      throw new Error(`unexpected ${url}`);
    });
    const r = await grabRelease(releaseId);
    expect(r.ok).toBe(true);
    expect(addCategories).toContain('my-manga');
    expect(infoCategories).toContain('my-manga');
    // both references in the grab agree
    expect(new Set([...addCategories, ...infoCategories])).toEqual(new Set(['my-manga']));
  });

  it('hands qBittorrent the resolved magnet for a Prowlarr magnet-redirect link', async () => {
    // The crux of the "added but not visible" bug: qBit cannot add an http
    // endpoint that 302-redirects to a magnet, so we must resolve + add the
    // magnet itself. resolveDownloadLink uses the GLOBAL fetch (stubbed here);
    // the qBit client uses its own injected fetcher.
    const H = 'cafebabe0123456789abcdef0123456789abcdef';
    const MAGNET2 = `magnet:?xt=urn:btih:${H}&dn=x`;
    vi.stubGlobal(
      'fetch',
      (async () => ({
        status: 301,
        ok: false,
        headers: { get: (n: string) => (n.toLowerCase() === 'location' ? MAGNET2 : null) },
        arrayBuffer: async () => new ArrayBuffer(0),
      })) as unknown as typeof fetch,
    );
    let addUrl = '';
    __setQbtFetcherForTests(async (url, init) => {
      if (url.endsWith('/api/v2/auth/login')) {
        return { ok: true, status: 200, headers: { 'set-cookie': 'SID=abc' }, text: async () => 'Ok.' };
      }
      if (url.endsWith('/torrents/add')) {
        const body = init?.body;
        addUrl = body instanceof FormData ? String(body.get('urls')) : '';
        return { ok: true, status: 200, headers: {}, text: async () => 'Ok.' };
      }
      if (url.includes('/torrents/info')) {
        return {
          ok: true,
          status: 200,
          headers: {},
          text: async () =>
            JSON.stringify([
              { hash: H, name: 'x', state: 'downloading', progress: 0, category: 'bookkeeprr-manga', tags: '', save_path: '/x', size: 0, completed: 0 },
            ]),
        };
      }
      throw new Error(`unexpected ${url}`);
    });
    const httpId = await upsertReleaseByGuid({
      indexerId: 1,
      indexerGuid: 'g-redirect',
      seriesId: h.seriesId,
      title: 't',
      link: 'http://prowlarr/1/download?id=1',
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      sizeBytes: 0,
      publishedAt: new Date(),
    });
    const r = await grabRelease(httpId);
    vi.unstubAllGlobals();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.result.qbtHash).toBe(H);
    expect(addUrl).toBe(MAGNET2); // qBit received the magnet, not the http URL
  });

  it('uploads the .torrent bytes to qBittorrent for a private-tracker http link', async () => {
    // FileList serves a real .torrent over http, but qBit often can't re-fetch it
    // (network isolation / single-use links). We download it during resolve and
    // must hand qBit the bytes (torrents field), not the URL.
    const bencode = (await import('bencode')).default;
    const { createHash } = await import('node:crypto');
    const info = { name: 'x', 'piece length': 1, pieces: Buffer.alloc(20), length: 1 };
    const torrentBytes = Buffer.from(bencode.encode({ info, announce: 'udp://t' }));
    const expectedHash = createHash('sha1').update(bencode.encode(info)).digest('hex');
    vi.stubGlobal(
      'fetch',
      (async () => ({
        status: 200,
        ok: true,
        headers: { get: () => null },
        arrayBuffer: async () => new Uint8Array(torrentBytes).buffer,
      })) as unknown as typeof fetch,
    );
    let usedTorrentsField = false;
    let usedUrlsField = true;
    __setQbtFetcherForTests(async (url, init) => {
      if (url.endsWith('/api/v2/auth/login')) {
        return { ok: true, status: 200, headers: { 'set-cookie': 'SID=abc' }, text: async () => 'Ok.' };
      }
      if (url.endsWith('/torrents/add')) {
        const body = init?.body;
        usedTorrentsField = body instanceof FormData && body.get('torrents') !== null;
        usedUrlsField = body instanceof FormData && body.get('urls') !== null;
        return { ok: true, status: 200, headers: {}, text: async () => 'Ok.' };
      }
      if (url.includes('/torrents/info')) {
        return {
          ok: true,
          status: 200,
          headers: {},
          text: async () =>
            JSON.stringify([
              { hash: expectedHash, name: 'x', state: 'downloading', progress: 0, category: 'bookkeeprr-manga', tags: '', save_path: '/x', size: 0, completed: 0 },
            ]),
        };
      }
      throw new Error(`unexpected ${url}`);
    });
    const flId = await upsertReleaseByGuid({
      indexerId: 1,
      indexerGuid: 'g-filelist',
      seriesId: h.seriesId,
      title: 't',
      link: 'http://filelist/download.php?id=1&passkey=x',
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      sizeBytes: 0,
      publishedAt: new Date(),
    });
    const r = await grabRelease(flId);
    vi.unstubAllGlobals();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.result.qbtHash).toBe(expectedHash);
    expect(usedTorrentsField).toBe(true); // bytes uploaded
    expect(usedUrlsField).toBe(false); // NOT handed the http url
  });

  it('grabs via category-diff when the info-hash cannot be precomputed (indexer 429)', async () => {
    // http download endpoint we can't reach (simulates Prowlarr 429 / blocked UA)
    // → precompute returns null → grabber must still add and discover the hash by
    // diffing the category, not fail with malformed-link.
    const httpId = await upsertReleaseByGuid({
      indexerId: 1,
      indexerGuid: 'g-http',
      seriesId: h.seriesId,
      title: 't',
      link: 'http://127.0.0.1:1/download?id=1', // ECONNREFUSED, fast + deterministic
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      sizeBytes: 0,
      publishedAt: new Date(),
    });
    const NEWHASH = 'beadfeed0123456789abcdef0123456789abcdef';
    let added = false;
    __setQbtFetcherForTests(async (url) => {
      if (url.endsWith('/api/v2/auth/login')) {
        return { ok: true, status: 200, headers: { 'set-cookie': 'SID=abc' }, text: async () => 'Ok.' };
      }
      if (url.endsWith('/torrents/add')) {
        added = true;
        return { ok: true, status: 200, headers: {}, text: async () => 'Ok.' };
      }
      if (url.includes('/torrents/info')) {
        // empty before the add; the newly-added torrent appears afterwards
        const torrents = added
          ? [
              {
                hash: NEWHASH,
                name: 'x',
                state: 'downloading',
                progress: 0,
                category: 'bookkeeprr-manga',
                tags: '',
                save_path: '/x',
                size: 0,
                completed: 0,
                added_on: 1_700_000_000,
              },
            ]
          : [];
        return { ok: true, status: 200, headers: {}, text: async () => JSON.stringify(torrents) };
      }
      throw new Error(`unexpected ${url}`);
    });
    const r = await grabRelease(httpId);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.result.qbtHash).toBe(NEWHASH);
  }, 10_000);

  it('returns qbt-not-visible when hash never appears in list', async () => {
    __setQbtFetcherForTests(async (url) => {
      if (url.endsWith('/api/v2/auth/login')) {
        return {
          ok: true,
          status: 200,
          headers: { 'set-cookie': 'SID=abc' },
          text: async () => 'Ok.',
        };
      }
      if (url.endsWith('/torrents/add')) {
        return { ok: true, status: 200, headers: {}, text: async () => 'Ok.' };
      }
      return { ok: true, status: 200, headers: {}, text: async () => '[]' };
    });
    const r = await grabRelease(releaseId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('qbt-not-visible');
  }, 10_000);
});
