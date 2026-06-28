import { describe, expect, it } from 'vitest';
import bencode from 'bencode';
import { createHash } from 'node:crypto';
import {
  parseMagnetInfohash,
  parseTorrentBytes,
  computeInfohashFromTorrentBytes,
  computeInfohashFromTorrentUrl,
  resolveDownloadLink,
} from '@/lib/infohash';

const MAGNET = 'magnet:?xt=urn:btih:abcdef0123456789abcdef0123456789abcdef01&dn=x';
const EXPECTED_FROM_MAGNET = 'abcdef0123456789abcdef0123456789abcdef01';

type MockResp = {
  status: number;
  ok: boolean;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
};
function resp(opts: {
  status?: number;
  location?: string;
  body?: Buffer;
}): MockResp {
  const status = opts.status ?? 200;
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (n) => (n.toLowerCase() === 'location' ? (opts.location ?? null) : null) },
    arrayBuffer: async () => {
      const b = opts.body ?? Buffer.alloc(0);
      return new Uint8Array(b).buffer;
    },
  };
}

describe('parseMagnetInfohash', () => {
  it('parses lowercase hex', () => {
    const h = parseMagnetInfohash('magnet:?xt=urn:btih:abcdef0123456789abcdef0123456789abcdef01');
    expect(h).toBe('abcdef0123456789abcdef0123456789abcdef01');
  });

  it('parses uppercase hex (normalizes to lowercase)', () => {
    const h = parseMagnetInfohash('magnet:?xt=urn:btih:ABCDEF0123456789ABCDEF0123456789ABCDEF01');
    expect(h).toBe('abcdef0123456789abcdef0123456789abcdef01');
  });

  it('parses base32 (32 chars) to lowercase hex', () => {
    // SHA-1 = "abcdef0123456789abcdef0123456789abcdef01" hex.
    // Base32 (RFC 4648, no padding) of the same 20 bytes = "VPG66AJDIVTYTK6N54ASGRLHRGV433YB"
    const base32NoPad = 'VPG66AJDIVTYTK6N54ASGRLHRGV433YB';
    const h = parseMagnetInfohash(`magnet:?xt=urn:btih:${base32NoPad}`);
    expect(h).toBe('abcdef0123456789abcdef0123456789abcdef01');
  });

  it('returns null when xt is missing', () => {
    expect(parseMagnetInfohash('magnet:?dn=foo')).toBeNull();
  });

  it('returns null when prefix is wrong', () => {
    expect(parseMagnetInfohash('https://nyaa.si/view/1')).toBeNull();
    expect(parseMagnetInfohash('magnet:?xt=urn:sha1:abc')).toBeNull();
  });

  it('returns null on malformed length', () => {
    expect(parseMagnetInfohash('magnet:?xt=urn:btih:short')).toBeNull();
    expect(parseMagnetInfohash('magnet:?xt=urn:btih:abc123')).toBeNull();
  });

  it('accepts additional magnet params', () => {
    const h = parseMagnetInfohash(
      'magnet:?xt=urn:btih:abcdef0123456789abcdef0123456789abcdef01&dn=name&tr=udp://tracker',
    );
    expect(h).toBe('abcdef0123456789abcdef0123456789abcdef01');
  });
});

describe('computeInfohashFromTorrentUrl', () => {
  it('resolves a Prowlarr download endpoint that 302-redirects to a magnet', async () => {
    const fetcher = (async (_url: string) =>
      resp({ status: 302, location: MAGNET })) as unknown as typeof fetch;
    const h = await computeInfohashFromTorrentUrl('http://prowlarr/1/download?link=x', fetcher);
    expect(h).toBe(EXPECTED_FROM_MAGNET);
  });

  it('resolves when the magnet is returned as the response body', async () => {
    const fetcher = (async (_url: string) =>
      resp({ status: 200, body: Buffer.from(MAGNET, 'utf8') })) as unknown as typeof fetch;
    const h = await computeInfohashFromTorrentUrl('http://prowlarr/1/download?link=x', fetcher);
    expect(h).toBe(EXPECTED_FROM_MAGNET);
  });

  it('follows an http→http redirect before the magnet', async () => {
    const seen: string[] = [];
    const fetcher = (async (url: string) => {
      seen.push(url);
      if (seen.length === 1) return resp({ status: 301, location: 'http://cdn/final' });
      return resp({ status: 302, location: MAGNET });
    }) as unknown as typeof fetch;
    const h = await computeInfohashFromTorrentUrl('http://prowlarr/1/download', fetcher);
    expect(h).toBe(EXPECTED_FROM_MAGNET);
    expect(seen).toEqual(['http://prowlarr/1/download', 'http://cdn/final']);
  });

  it('decodes a real .torrent body and hashes the info dict', async () => {
    const info = { name: 'x', 'piece length': 1, pieces: Buffer.alloc(20), length: 1 };
    const torrent = Buffer.from(bencode.encode({ info, announce: 'udp://t' }));
    const expected = createHash('sha1').update(bencode.encode(info)).digest('hex');
    const fetcher = (async (_url: string) =>
      resp({ status: 200, body: torrent })) as unknown as typeof fetch;
    const h = await computeInfohashFromTorrentUrl('http://filelist/download.php?id=1', fetcher);
    expect(h).toBe(expected);
  });

  it('throws on a non-ok response', async () => {
    const fetcher = (async (_url: string) => resp({ status: 404 })) as unknown as typeof fetch;
    await expect(
      computeInfohashFromTorrentUrl('http://prowlarr/1/download', fetcher),
    ).rejects.toThrow(/HTTP 404/);
  });
});

describe('parseTorrentBytes', () => {
  it('hashes the info dict and extracts name + single-file size', () => {
    const info = { name: 'My Upload', 'piece length': 1, pieces: Buffer.alloc(20), length: 42 };
    const torrent = Buffer.from(bencode.encode({ info, announce: 'udp://t' }));
    const expected = createHash('sha1').update(bencode.encode(info)).digest('hex');
    const parsed = parseTorrentBytes(torrent);
    expect(parsed.infohash).toBe(expected);
    expect(parsed.name).toBe('My Upload');
    expect(parsed.sizeBytes).toBe(42);
  });

  it('sums multi-file sizes', () => {
    const info = {
      name: 'Multi',
      'piece length': 1,
      pieces: Buffer.alloc(20),
      files: [
        { length: 10, path: ['a'] },
        { length: 32, path: ['b'] },
      ],
    };
    const torrent = Buffer.from(bencode.encode({ info }));
    const parsed = parseTorrentBytes(torrent);
    expect(parsed.sizeBytes).toBe(42);
  });

  it('throws on non-bencoded bytes', () => {
    expect(() => parseTorrentBytes(Buffer.from('not a torrent at all'))).toThrow(
      /not a bencoded torrent/,
    );
  });

  it('throws when the info dict is missing', () => {
    const torrent = Buffer.from(bencode.encode({ announce: 'udp://t' }));
    expect(() => parseTorrentBytes(torrent)).toThrow(/missing info dict/);
  });
});

describe('computeInfohashFromTorrentBytes', () => {
  it('returns just the info-hash', () => {
    const info = { name: 'x', 'piece length': 1, pieces: Buffer.alloc(20), length: 1 };
    const torrent = Buffer.from(bencode.encode({ info }));
    const expected = createHash('sha1').update(bencode.encode(info)).digest('hex');
    expect(computeInfohashFromTorrentBytes(torrent)).toBe(expected);
  });
});

describe('resolveDownloadLink', () => {
  it('returns the magnet (not the http URL) when the endpoint redirects to a magnet', async () => {
    const fetcher = (async (_url: string) =>
      resp({ status: 302, location: MAGNET })) as unknown as typeof fetch;
    const r = await resolveDownloadLink('http://prowlarr/1/download?link=x', fetcher);
    expect(r.kind).toBe('magnet');
    if (r.kind === 'magnet') {
      expect(r.magnet).toBe(MAGNET);
      expect(r.infohash).toBe(EXPECTED_FROM_MAGNET);
    }
  });

  it('returns the original http URL AND the raw bytes when it serves a real .torrent', async () => {
    const info = { name: 'x', 'piece length': 1, pieces: Buffer.alloc(20), length: 1 };
    const torrent = Buffer.from(bencode.encode({ info }));
    const fetcher = (async (_url: string) =>
      resp({ status: 200, body: torrent })) as unknown as typeof fetch;
    const r = await resolveDownloadLink('http://filelist/download.php?id=1', fetcher);
    expect(r.kind).toBe('torrent');
    if (r.kind === 'torrent') {
      expect(r.url).toBe('http://filelist/download.php?id=1');
      expect(Buffer.from(r.torrent).equals(torrent)).toBe(true); // bytes preserved for upload
    }
  });
});
