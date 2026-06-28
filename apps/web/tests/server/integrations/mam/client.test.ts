import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  searchMam,
  downloadMamTorrent,
  MamError,
  __setMamFetcherForTests,
  __resetMamForTests,
} from '@/server/integrations/mam';

const FIXTURE_DIR = path.resolve(__dirname, '../../../fixtures/mam');
const BASE = 'https://www.myanonamouse.net';
const CREDS = { mamId: 'sess123', proxyUrl: '', searchIn: ['title'] };

async function loadFixture(name: string): Promise<string> {
  return readFile(path.join(FIXTURE_DIR, name), 'utf-8');
}

function ok(body: string) {
  return async () => ({
    ok: true,
    status: 200,
    text: async () => body,
    bytes: async () => new Uint8Array(),
  });
}

beforeEach(() => __resetMamForTests());
afterEach(() => __resetMamForTests());

describe('searchMam', () => {
  it('maps results, preferring title then name, with freeleech/vip flags', async () => {
    __setMamFetcherForTests(ok(await loadFixture('search-success.json')));
    const items = await searchMam(CREDS, { q: 'love', mainCat: 13 }, BASE);
    expect(items).toHaveLength(2);

    const a = items[0]!;
    expect(a.guid).toBe('273200');
    expect(a.title).toBe('Love at Stake series'); // from `name`
    expect(a.sizeBytes).toBe(6324306932);
    expect(a.seeders).toBe(12);
    expect(a.category).toBe('13');
    expect(a.link).toBe('https://www.myanonamouse.net/tor/download.php?tid=273200');
    expect(a.infoHash).toBeNull();
    expect(a.freeleech).toBe(true);
    expect(a.vip).toBe(false);
    expect(a.pubDate.toISOString()).toBe('2024-06-01T12:30:45.000Z');

    const b = items[1]!;
    expect(b.title).toBe('Some Ebook Title'); // from `title`
    expect(b.freeleech).toBe(false);
    expect(b.vip).toBe(true);
    expect(b.category).toBe('14');
  });

  it('returns [] on empty data', async () => {
    __setMamFetcherForTests(ok(await loadFixture('empty.json')));
    expect(await searchMam(CREDS, { q: 'nothing', mainCat: 14 }, BASE)).toEqual([]);
  });

  it('throws MamError on 403 (bad session)', async () => {
    __setMamFetcherForTests(async () => ({
      ok: false,
      status: 403,
      text: async () => '',
      bytes: async () => new Uint8Array(),
    }));
    const p = searchMam(CREDS, { q: 'x', mainCat: 14 }, BASE);
    await expect(p).rejects.toThrow(MamError);
    await expect(p).rejects.toThrow(/session invalid/);
  });

  it('throws MamError when MAM returns an HTML login page', async () => {
    __setMamFetcherForTests(ok('<!DOCTYPE html><html>login</html>'));
    const p = searchMam(CREDS, { q: 'x', mainCat: 14 }, BASE);
    await expect(p).rejects.toThrow(MamError);
    await expect(p).rejects.toThrow(/HTML/);
  });

  it('throws MamError on malformed JSON', async () => {
    __setMamFetcherForTests(ok('not json'));
    const p = searchMam(CREDS, { q: 'x', mainCat: 14 }, BASE);
    await expect(p).rejects.toThrow(MamError);
    await expect(p).rejects.toThrow(/response shape invalid/);
  });

  it('throws MamError on network failure', async () => {
    __setMamFetcherForTests(async () => {
      throw new Error('connection refused');
    });
    const p = searchMam(CREDS, { q: 'x', mainCat: 14 }, BASE);
    await expect(p).rejects.toThrow(MamError);
    await expect(p).rejects.toThrow(/fetch failed/);
  });

  it('caches identical queries for the TTL window', async () => {
    let calls = 0;
    __setMamFetcherForTests(async () => {
      calls++;
      return {
        ok: true,
        status: 200,
        text: async () => '{"data":[],"total":0,"total_found":0}',
        bytes: async () => new Uint8Array(),
      };
    });
    await searchMam(CREDS, { q: 'same', mainCat: 14 }, BASE);
    await searchMam(CREDS, { q: 'same', mainCat: 14 }, BASE);
    expect(calls).toBe(1);
  });
});

describe('downloadMamTorrent', () => {
  it('returns the .torrent bytes on success', async () => {
    const torrent = new Uint8Array([0x64, 0x38, 0x3a]); // 'd8:' — bencoded dict start
    __setMamFetcherForTests(async (url, init) => {
      expect(url).toBe('https://www.myanonamouse.net/tor/download.php?tid=273200');
      expect(init.headers.cookie).toBe('mam_id=sess123');
      return { ok: true, status: 200, text: async () => '', bytes: async () => torrent };
    });
    const bytes = await downloadMamTorrent(
      { mamId: 'sess123', proxyUrl: '' },
      '273200',
      'https://www.myanonamouse.net',
    );
    expect(Array.from(bytes)).toEqual([0x64, 0x38, 0x3a]);
  });

  it('throws when MAM returns a non-torrent (HTML login) body', async () => {
    const html = new TextEncoder().encode('<!DOCTYPE html>');
    __setMamFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => '',
      bytes: async () => html,
    }));
    const p = downloadMamTorrent({ mamId: 'x', proxyUrl: '' }, '1', 'https://www.myanonamouse.net');
    await expect(p).rejects.toThrow(MamError);
    await expect(p).rejects.toThrow(/did not return a \.torrent/);
  });

  it('throws MamError on 403', async () => {
    __setMamFetcherForTests(async () => ({
      ok: false,
      status: 403,
      text: async () => '',
      bytes: async () => new Uint8Array(),
    }));
    const p = downloadMamTorrent({ mamId: 'x', proxyUrl: '' }, '1', 'https://www.myanonamouse.net');
    await expect(p).rejects.toThrow(MamError);
    await expect(p).rejects.toThrow(/session invalid/);
  });
});
