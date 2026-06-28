import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  __resetQbtForTests,
  __setQbtFetcherForTests,
  testConnection,
  addTorrent,
  assertAddAccepted,
  listTorrentsInCategory,
  getTorrentFiles,
  pauseTorrent,
  resumeTorrent,
  deleteTorrent,
  pauseTorrentsByCategory,
  QbittorrentError,
} from '@/server/integrations/qbittorrent/client';
import type { QbtConnection } from '@/server/db/settings/qbt';

const F = (name: string) =>
  readFileSync(join(process.cwd(), 'tests/fixtures/qbittorrent', name), 'utf-8');

const CFG: QbtConnection = {
  host: 'qbt.local',
  port: 8080,
  username: 'admin',
  password: 'adminadmin',
  useHttps: false,
};

let urls: string[];

beforeEach(() => {
  __resetQbtForTests();
  urls = [];
});

describe('qbittorrent client', () => {
  it('testConnection logs in and lists once', async () => {
    __setQbtFetcherForTests(async (url) => {
      urls.push(url);
      if (url.endsWith('/api/v2/auth/login')) {
        return {
          ok: true,
          status: 200,
          headers: { 'set-cookie': 'SID=abc; path=/' },
          text: async () => F('login-ok.txt'),
        };
      }
      if (url.includes('/api/v2/torrents/info')) {
        return { ok: true, status: 200, headers: {}, text: async () => F('torrents-list.json') };
      }
      throw new Error(`unexpected url ${url}`);
    });
    await expect(testConnection(CFG)).resolves.toBeUndefined();
    expect(urls).toEqual([
      'http://qbt.local:8080/api/v2/auth/login',
      'http://qbt.local:8080/api/v2/torrents/info?category=bookkeeprr-manga',
    ]);
  });

  it('testConnection logs in against qBittorrent 5.x (204 + QBT_SID cookie)', async () => {
    let listCookie: string | undefined;
    __setQbtFetcherForTests(async (url, init) => {
      urls.push(url);
      if (url.endsWith('/api/v2/auth/login')) {
        // qBittorrent 5.x: empty 204 body, port-suffixed session cookie.
        return {
          ok: true,
          status: 204,
          headers: {
            'set-cookie':
              'QBT_SID_8080=+VC0/Hvmum1Eq/w8B5VWxAeksT2r/EmN; HttpOnly; SameSite=Strict; path=/',
          },
          text: async () => '',
        };
      }
      if (url.includes('/api/v2/torrents/info')) {
        listCookie = init?.headers?.cookie;
        return { ok: true, status: 200, headers: {}, text: async () => F('torrents-list.json') };
      }
      throw new Error(`unexpected url ${url}`);
    });
    await expect(testConnection(CFG)).resolves.toBeUndefined();
    expect(listCookie).toBe('QBT_SID_8080=+VC0/Hvmum1Eq/w8B5VWxAeksT2r/EmN');
  });

  it('testConnection throws on Fails. body', async () => {
    __setQbtFetcherForTests(async () => ({
      ok: true,
      status: 200,
      headers: {},
      text: async () => F('login-fail.txt'),
    }));
    await expect(testConnection(CFG)).rejects.toBeInstanceOf(QbittorrentError);
  });

  it('addTorrent sends multipart and parses Ok.', async () => {
    let addCalled = false;
    __setQbtFetcherForTests(async (url, init) => {
      if (url.endsWith('/api/v2/auth/login')) {
        return {
          ok: true,
          status: 200,
          headers: { 'set-cookie': 'SID=abc' },
          text: async () => F('login-ok.txt'),
        };
      }
      if (url.endsWith('/api/v2/torrents/add')) {
        addCalled = true;
        // body should be FormData; we don't inspect it deeply but assert presence
        expect(init?.method).toBe('POST');
        return { ok: true, status: 200, headers: {}, text: async () => 'Ok.' };
      }
      throw new Error(`unexpected url ${url}`);
    });
    await addTorrent(CFG, {
      url: 'magnet:?xt=urn:btih:abc',
      category: 'bookkeeprr-manga',
      tags: ['series-1'],
      savePath: '/media/downloads/incomplete',
    });
    expect(addCalled).toBe(true);
  });

  it('addTorrent uploads raw .torrent bytes via the torrents field (not urls)', async () => {
    let hasTorrents = false;
    let hasUrls = true;
    __setQbtFetcherForTests(async (url, init) => {
      if (url.endsWith('/api/v2/auth/login')) {
        return { ok: true, status: 200, headers: { 'set-cookie': 'SID=abc' }, text: async () => F('login-ok.txt') };
      }
      if (url.endsWith('/api/v2/torrents/add')) {
        const body = init?.body;
        hasTorrents = body instanceof FormData && body.get('torrents') !== null;
        hasUrls = body instanceof FormData && body.get('urls') !== null;
        return { ok: true, status: 200, headers: {}, text: async () => 'Ok.' };
      }
      throw new Error(`unexpected url ${url}`);
    });
    await addTorrent(CFG, {
      torrentFile: new Uint8Array([1, 2, 3, 4]),
      category: 'bookkeeprr-ebook',
      tags: [],
      savePath: '/media/downloads/incomplete',
    });
    expect(hasTorrents).toBe(true);
    expect(hasUrls).toBe(false);
  });

  it('addTorrent treats HTTP 409 (already added) as success', async () => {
    __setQbtFetcherForTests(async (url) => {
      if (url.endsWith('/api/v2/auth/login')) {
        return { ok: true, status: 200, headers: { 'set-cookie': 'SID=abc' }, text: async () => F('login-ok.txt') };
      }
      return { ok: false, status: 409, headers: {}, text: async () => 'Conflict' };
    });
    await expect(
      addTorrent(CFG, { url: 'magnet:?xt=urn:btih:abc', category: 'c', tags: [], savePath: '/x' }),
    ).resolves.toBeUndefined(); // does not throw — torrent already present
  });

  it('addTorrent accepts the qBittorrent 5.x JSON response (pending_count)', async () => {
    // qBit 5.x returns JSON instead of "Ok."; pending_count means the torrent
    // was accepted (it shows up + seeds). This used to be treated as a failure.
    __setQbtFetcherForTests(async (url) => {
      if (url.endsWith('/api/v2/auth/login'))
        return {
          ok: true,
          status: 200,
          headers: { 'set-cookie': 'SID=abc' },
          text: async () => F('login-ok.txt'),
        };
      return {
        ok: true,
        status: 200,
        headers: {},
        text: async () =>
          '{"added_torrent_ids":[],"failure_count":0,"pending_count":1,"success_count":0}',
      };
    });
    await expect(
      addTorrent(CFG, {
        url: 'magnet:?xt=urn:btih:abc',
        category: 'bookkeeprr-manga',
        tags: [],
        savePath: '/x',
      }),
    ).resolves.toBeUndefined();
  });

  describe('assertAddAccepted', () => {
    it('accepts legacy "Ok." and an empty body', () => {
      expect(() => assertAddAccepted('Ok.')).not.toThrow();
      expect(() => assertAddAccepted('')).not.toThrow();
    });
    it('accepts qBit 5.x success_count / pending_count / added ids', () => {
      expect(() => assertAddAccepted('{"success_count":1,"pending_count":0,"failure_count":0}')).not.toThrow();
      expect(() => assertAddAccepted('{"success_count":0,"pending_count":1,"failure_count":0}')).not.toThrow();
      expect(() => assertAddAccepted('{"added_torrent_ids":["abc"],"success_count":0,"pending_count":0}')).not.toThrow();
    });
    it('throws on legacy "Fails." and a non-JSON body', () => {
      expect(() => assertAddAccepted('Fails.')).toThrow(QbittorrentError);
      expect(() => assertAddAccepted('<html>error</html>')).toThrow(QbittorrentError);
    });
    it('throws when nothing was accepted (failure-only JSON)', () => {
      expect(() =>
        assertAddAccepted('{"added_torrent_ids":[],"failure_count":1,"pending_count":0,"success_count":0}'),
      ).toThrow(QbittorrentError);
    });
  });

  it('addTorrent throws on Fails. body', async () => {
    __setQbtFetcherForTests(async (url) => {
      if (url.endsWith('/api/v2/auth/login'))
        return {
          ok: true,
          status: 200,
          headers: { 'set-cookie': 'SID=abc' },
          text: async () => F('login-ok.txt'),
        };
      return { ok: true, status: 200, headers: {}, text: async () => 'Fails.' };
    });
    await expect(
      addTorrent(CFG, {
        url: 'magnet:?xt=urn:btih:abc',
        category: 'bookkeeprr-manga',
        tags: [],
        savePath: '/x',
      }),
    ).rejects.toBeInstanceOf(QbittorrentError);
  });

  it('listTorrentsInCategory parses JSON', async () => {
    __setQbtFetcherForTests(async (url) => {
      if (url.endsWith('/api/v2/auth/login'))
        return {
          ok: true,
          status: 200,
          headers: { 'set-cookie': 'SID=abc' },
          text: async () => F('login-ok.txt'),
        };
      return { ok: true, status: 200, headers: {}, text: async () => F('torrents-list.json') };
    });
    const list = await listTorrentsInCategory(CFG, 'bookkeeprr-manga');
    expect(list).toHaveLength(2);
    expect(list[0]?.hash).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(list[1]?.state).toBe('stalledUP');
  });

  it('getTorrentFiles parses JSON', async () => {
    __setQbtFetcherForTests(async (url) => {
      if (url.endsWith('/api/v2/auth/login'))
        return {
          ok: true,
          status: 200,
          headers: { 'set-cookie': 'SID=abc' },
          text: async () => F('login-ok.txt'),
        };
      return { ok: true, status: 200, headers: {}, text: async () => F('torrents-files.json') };
    });
    const files = await getTorrentFiles(CFG, 'aaaa');
    expect(files).toHaveLength(3);
    expect(files[0]?.name).toBe('Series Title - v01 [Group].cbz');
  });

  it('session refresh: 403 triggers one re-login then succeeds', async () => {
    let listCalls = 0;
    let loginCalls = 0;
    __setQbtFetcherForTests(async (url) => {
      if (url.endsWith('/api/v2/auth/login')) {
        loginCalls++;
        return {
          ok: true,
          status: 200,
          headers: { 'set-cookie': 'SID=abc' },
          text: async () => F('login-ok.txt'),
        };
      }
      listCalls++;
      if (listCalls === 1)
        return { ok: false, status: 403, headers: {}, text: async () => 'Forbidden' };
      return { ok: true, status: 200, headers: {}, text: async () => F('torrents-list.json') };
    });
    const list = await listTorrentsInCategory(CFG, 'bookkeeprr-manga');
    expect(list).toHaveLength(2);
    expect(loginCalls).toBe(2); // initial + refresh
    expect(listCalls).toBe(2);
  });

  it('uses https when useHttps is true', async () => {
    let seen = '';
    __setQbtFetcherForTests(async (url) => {
      seen = url;
      if (url.endsWith('/api/v2/auth/login'))
        return {
          ok: true,
          status: 200,
          headers: { 'set-cookie': 'SID=abc' },
          text: async () => F('login-ok.txt'),
        };
      return { ok: true, status: 200, headers: {}, text: async () => F('torrents-list.json') };
    });
    await testConnection({ ...CFG, useHttps: true });
    expect(seen).toContain('https://');
  });

  describe('pauseTorrent', () => {
    it('posts to torrents/pause with the hash', async () => {
      let pauseBody: string | undefined;
      __setQbtFetcherForTests(async (url, init) => {
        if (url.endsWith('/api/v2/auth/login'))
          return {
            ok: true,
            status: 200,
            headers: { 'set-cookie': 'SID=abc' },
            text: async () => F('login-ok.txt'),
          };
        if (url.endsWith('/api/v2/torrents/pause')) {
          pauseBody = init?.body as string;
          return { ok: true, status: 200, headers: {}, text: async () => '' };
        }
        throw new Error(`unexpected url ${url}`);
      });
      await pauseTorrent(CFG, 'abc123');
      expect(pauseBody).toBe('hashes=abc123');
    });

    it('throws QbittorrentError on HTTP error', async () => {
      __setQbtFetcherForTests(async (url) => {
        if (url.endsWith('/api/v2/auth/login'))
          return {
            ok: true,
            status: 200,
            headers: { 'set-cookie': 'SID=abc' },
            text: async () => F('login-ok.txt'),
          };
        return { ok: false, status: 500, headers: {}, text: async () => 'error' };
      });
      await expect(pauseTorrent(CFG, 'abc123')).rejects.toBeInstanceOf(QbittorrentError);
    });
  });

  describe('resumeTorrent', () => {
    it('posts to torrents/resume with the hash', async () => {
      let resumeBody: string | undefined;
      __setQbtFetcherForTests(async (url, init) => {
        if (url.endsWith('/api/v2/auth/login'))
          return {
            ok: true,
            status: 200,
            headers: { 'set-cookie': 'SID=abc' },
            text: async () => F('login-ok.txt'),
          };
        if (url.endsWith('/api/v2/torrents/resume')) {
          resumeBody = init?.body as string;
          return { ok: true, status: 200, headers: {}, text: async () => '' };
        }
        throw new Error(`unexpected url ${url}`);
      });
      await resumeTorrent(CFG, 'deadbeef');
      expect(resumeBody).toBe('hashes=deadbeef');
    });

    it('throws QbittorrentError on HTTP error', async () => {
      __setQbtFetcherForTests(async (url) => {
        if (url.endsWith('/api/v2/auth/login'))
          return {
            ok: true,
            status: 200,
            headers: { 'set-cookie': 'SID=abc' },
            text: async () => F('login-ok.txt'),
          };
        return { ok: false, status: 502, headers: {}, text: async () => 'bad gateway' };
      });
      await expect(resumeTorrent(CFG, 'deadbeef')).rejects.toBeInstanceOf(QbittorrentError);
    });
  });

  describe('deleteTorrent', () => {
    it('posts to torrents/delete with deleteFiles=false by default', async () => {
      let deleteBody: string | undefined;
      __setQbtFetcherForTests(async (url, init) => {
        if (url.endsWith('/api/v2/auth/login'))
          return {
            ok: true,
            status: 200,
            headers: { 'set-cookie': 'SID=abc' },
            text: async () => F('login-ok.txt'),
          };
        if (url.endsWith('/api/v2/torrents/delete')) {
          deleteBody = init?.body as string;
          return { ok: true, status: 200, headers: {}, text: async () => '' };
        }
        throw new Error(`unexpected url ${url}`);
      });
      await deleteTorrent(CFG, 'cafe1234');
      expect(deleteBody).toBe('hashes=cafe1234&deleteFiles=false');
    });

    it('posts deleteFiles=true when requested', async () => {
      let deleteBody: string | undefined;
      __setQbtFetcherForTests(async (url, init) => {
        if (url.endsWith('/api/v2/auth/login'))
          return {
            ok: true,
            status: 200,
            headers: { 'set-cookie': 'SID=abc' },
            text: async () => F('login-ok.txt'),
          };
        if (url.endsWith('/api/v2/torrents/delete')) {
          deleteBody = init?.body as string;
          return { ok: true, status: 200, headers: {}, text: async () => '' };
        }
        throw new Error(`unexpected url ${url}`);
      });
      await deleteTorrent(CFG, 'cafe1234', { deleteFiles: true });
      expect(deleteBody).toBe('hashes=cafe1234&deleteFiles=true');
    });

    it('throws QbittorrentError on HTTP error', async () => {
      __setQbtFetcherForTests(async (url) => {
        if (url.endsWith('/api/v2/auth/login'))
          return {
            ok: true,
            status: 200,
            headers: { 'set-cookie': 'SID=abc' },
            text: async () => F('login-ok.txt'),
          };
        return { ok: false, status: 500, headers: {}, text: async () => 'error' };
      });
      await expect(deleteTorrent(CFG, 'cafe1234')).rejects.toBeInstanceOf(QbittorrentError);
    });
  });

  describe('pauseTorrentsByCategory', () => {
    it('collects hashes from all content-type categories and pauses them', async () => {
      const infoCalls: string[] = [];
      let pauseBody: string | undefined;
      __setQbtFetcherForTests(async (url, init) => {
        if (url.endsWith('/api/v2/auth/login'))
          return {
            ok: true,
            status: 200,
            headers: { 'set-cookie': 'SID=abc' },
            text: async () => F('login-ok.txt'),
          };
        if (url.includes('/api/v2/torrents/info')) {
          infoCalls.push(url);
          // Only return torrents for manga category; others return empty
          if (url.includes('bookkeeprr-manga')) {
            return { ok: true, status: 200, headers: {}, text: async () => F('torrents-list.json') };
          }
          return { ok: true, status: 200, headers: {}, text: async () => '[]' };
        }
        if (url.endsWith('/api/v2/torrents/pause')) {
          pauseBody = init?.body as string;
          return { ok: true, status: 200, headers: {}, text: async () => '' };
        }
        throw new Error(`unexpected url ${url}`);
      });
      await pauseTorrentsByCategory(CFG, 'bookkeeprr');
      // Should have called info for all 5 content types
      expect(infoCalls).toHaveLength(5);
      // Should have collected hashes from manga (2 torrents in fixture)
      expect(pauseBody).toContain('hashes=');
      const hashes = pauseBody?.replace('hashes=', '').split('%7C') ?? [];
      expect(hashes).toHaveLength(2);
    });

    it('returns early without pause call when no hashes found', async () => {
      let pauseCalled = false;
      __setQbtFetcherForTests(async (url) => {
        if (url.endsWith('/api/v2/auth/login'))
          return {
            ok: true,
            status: 200,
            headers: { 'set-cookie': 'SID=abc' },
            text: async () => F('login-ok.txt'),
          };
        if (url.includes('/api/v2/torrents/info'))
          return { ok: true, status: 200, headers: {}, text: async () => '[]' };
        if (url.endsWith('/api/v2/torrents/pause')) {
          pauseCalled = true;
          return { ok: true, status: 200, headers: {}, text: async () => '' };
        }
        throw new Error(`unexpected url ${url}`);
      });
      await pauseTorrentsByCategory(CFG, 'bookkeeprr');
      expect(pauseCalled).toBe(false);
    });
  });
});
