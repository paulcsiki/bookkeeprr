import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import bencode from 'bencode';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { getDb } from '@/server/db/client';
import { releases, indexers, downloads } from '@/server/db/schema';
import { insertDownload, updateDownload, getDownload } from '@/server/db/downloads';
import { qbtConnectionSetting } from '@/server/db/settings/qbt';
import { manualGrab } from '@/server/grabber/manual';
import {
  __setQbtFetcherForTests,
  __resetQbtForTests,
} from '@/server/integrations/qbittorrent/client';

let h: SeedHandle;

const HASH = 'abcdef0123456789abcdef0123456789abcdef01';
const MAGNET = `magnet:?xt=urn:btih:${HASH}&dn=My+Manual+Release`;

// A minimal valid .torrent: bencoded dict with an info dict.
const TORRENT_INFO = {
  name: 'Uploaded Torrent Name',
  'piece length': 1,
  pieces: Buffer.alloc(20),
  length: 1234,
};
const TORRENT_BYTES = Buffer.from(bencode.encode({ info: TORRENT_INFO, announce: 'udp://t' }));
const TORRENT_HASH = createHash('sha1').update(bencode.encode(TORRENT_INFO)).digest('hex');

beforeEach(async () => {
  h = await seedDb();
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

/** qBt mock whose torrents/info lists `hash` after a successful add. */
function mockHappy(hash: string): { addBodies: FormData[] } {
  const addBodies: FormData[] = [];
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
      if (init?.body instanceof FormData) addBodies.push(init.body);
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
              hash,
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
  return { addBodies };
}

describe('manualGrab — magnet input', () => {
  it('happy path: inserts a manual release + download row, qbt receives the magnet', async () => {
    const { addBodies } = mockHappy(HASH);
    const r = await manualGrab(h.seriesId, { magnet: MAGNET });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    expect(r.result.qbtHash).toBe(HASH);
    expect(r.result.downloadId).toBeGreaterThan(0);

    // Release row: manual sentinel indexer, synthetic guid, conservative shape.
    const [rel] = await getDb()
      .select()
      .from(releases)
      .where(eq(releases.id, r.result.releaseId));
    expect(rel).toBeDefined();
    expect(rel!.seriesId).toBe(h.seriesId);
    expect(rel!.indexerGuid).toBe(`manual:${HASH}`);
    expect(rel!.title).toBe('My Manual Release'); // from dn=
    expect(rel!.link).toBe(MAGNET);
    expect(rel!.targetKind).toBe('batch');
    expect(rel!.targetLow).toBeNull();
    expect(rel!.targetHigh).toBeNull();
    const [idx] = await getDb()
      .select()
      .from(indexers)
      .where(eq(indexers.id, rel!.indexerId));
    expect(idx!.kind).toBe('manual');
    expect(idx!.enabled).toBe(false);

    // qBt got the magnet as urls.
    expect(addBodies.length).toBe(1);
    expect(String(addBodies[0]!.get('urls'))).toBe(MAGNET);

    // Download row exists with the parsed hash.
    const dl = await getDownload(r.result.downloadId);
    expect(dl!.qbtHash).toBe(HASH);
    expect(dl!.status).toBe('queued');
  });

  it('derives the fallback title when the magnet has no dn=', async () => {
    mockHappy(HASH);
    const r = await manualGrab(h.seriesId, { magnet: `magnet:?xt=urn:btih:${HASH}` });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [rel] = await getDb()
      .select()
      .from(releases)
      .where(eq(releases.id, r.result.releaseId));
    expect(rel!.title).toBe(`Manual upload ${HASH.slice(0, 8)}`);
  });

  it('rejects a magnet without a btih info-hash', async () => {
    const r = await manualGrab(h.seriesId, { magnet: 'magnet:?dn=nope' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid-input');
  });

  it('rejects a non-magnet string', async () => {
    const r = await manualGrab(h.seriesId, { magnet: 'https://example.com/foo.torrent' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid-input');
  });

  it('returns series-not-found for an unknown series', async () => {
    const r = await manualGrab(99999, { magnet: MAGNET });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('series-not-found');
  });

  it('returns not-configured when qbt is unset', async () => {
    await qbtConnectionSetting.set({
      host: '',
      port: 8080,
      username: '',
      password: '',
      useHttps: false,
    });
    const r = await manualGrab(h.seriesId, { magnet: MAGNET });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('not-configured');
  });

  it('is idempotent: re-adding the same torrent with an active download → duplicate', async () => {
    mockHappy(HASH);
    const first = await manualGrab(h.seriesId, { magnet: MAGNET });
    expect(first.ok).toBe(true);
    const second = await manualGrab(h.seriesId, { magnet: MAGNET });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe('duplicate');
      if (second.error.code === 'duplicate') {
        expect(second.error.downloadId).toBe(first.ok ? first.result.downloadId : -1);
      }
    }
  });

  it('detects a duplicate against a download grabbed under a DIFFERENT release guid', async () => {
    // Simulates qbt-adopt / indexer grabs already holding this info-hash.
    const { upsertReleaseByGuid } = await import('@/server/db/releases');
    const otherReleaseId = await upsertReleaseByGuid({
      indexerId: h.indexerId,
      indexerGuid: 'g-other',
      seriesId: h.seriesId,
      title: 't',
      link: MAGNET,
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      sizeBytes: 0,
      publishedAt: new Date(),
    });
    await insertDownload({ releaseId: otherReleaseId, qbtHash: HASH, status: 'downloading' });
    const r = await manualGrab(h.seriesId, { magnet: MAGNET });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('duplicate');
  });

  it('clears a terminal (failed) leftover for the same hash and re-grabs', async () => {
    mockHappy(HASH);
    const first = await manualGrab(h.seriesId, { magnet: MAGNET });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    await updateDownload(first.result.downloadId, { status: 'failed', error: 'boom' });

    const second = await manualGrab(h.seriesId, { magnet: MAGNET });
    expect(second.ok, JSON.stringify(second)).toBe(true);
    if (!second.ok) return;
    // Same release row reused (upsert by guid); fresh download row.
    expect(second.result.releaseId).toBe(first.result.releaseId);
    expect(second.result.downloadId).not.toBe(first.result.downloadId);
    const rows = await getDb()
      .select()
      .from(downloads)
      .where(eq(downloads.qbtHash, HASH));
    expect(rows.length).toBe(1); // stale failed row deleted
    expect(rows[0]!.status).toBe('queued');
  });
});

describe('manualGrab — .torrent bytes input', () => {
  it('happy path: computes the infohash, uploads the bytes, title from info.name', async () => {
    const { addBodies } = mockHappy(TORRENT_HASH);
    const r = await manualGrab(h.seriesId, {
      torrentBytes: new Uint8Array(TORRENT_BYTES),
      fileName: 'whatever.torrent',
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    expect(r.result.qbtHash).toBe(TORRENT_HASH);

    const [rel] = await getDb()
      .select()
      .from(releases)
      .where(eq(releases.id, r.result.releaseId));
    expect(rel!.indexerGuid).toBe(`manual:${TORRENT_HASH}`);
    expect(rel!.title).toBe('Uploaded Torrent Name'); // info.name wins over fileName
    expect(rel!.link).toBe(''); // nothing to re-fetch
    expect(rel!.sizeBytes).toBe(1234);

    // qBt received the bytes (torrents field), not a urls field.
    expect(addBodies.length).toBe(1);
    expect(addBodies[0]!.get('torrents')).not.toBeNull();
    expect(addBodies[0]!.get('urls')).toBeNull();
  });

  it('falls back to the file name when the info dict has no name', async () => {
    const info = { 'piece length': 1, pieces: Buffer.alloc(20), length: 1 };
    const bytes = Buffer.from(bencode.encode({ info }));
    const hash = createHash('sha1').update(bencode.encode(info)).digest('hex');
    mockHappy(hash);
    const r = await manualGrab(h.seriesId, {
      torrentBytes: new Uint8Array(bytes),
      fileName: 'My File Name.torrent',
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    const [rel] = await getDb()
      .select()
      .from(releases)
      .where(eq(releases.id, r.result.releaseId));
    expect(rel!.title).toBe('My File Name');
  });

  it('rejects bytes that are not a bencoded torrent', async () => {
    const r = await manualGrab(h.seriesId, {
      torrentBytes: new Uint8Array(Buffer.from('hello world')),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('invalid-input');
      expect(r.error.message).toMatch(/not a valid \.torrent/);
    }
  });

  it('rejects a bencoded dict without an info dict', async () => {
    const r = await manualGrab(h.seriesId, {
      torrentBytes: new Uint8Array(Buffer.from(bencode.encode({ announce: 'udp://t' }))),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid-input');
  });
});
