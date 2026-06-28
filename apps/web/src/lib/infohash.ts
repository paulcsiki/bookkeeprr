import bencode from 'bencode';
import { createHash } from 'node:crypto';

const HEX_40_RE = /^[0-9a-f]{40}$/i;
const BASE32_32_RE = /^[A-Z2-7]{32}=*$/;

function base32ToHex(input: string): string | null {
  // RFC 4648 base32 → 20 bytes → hex
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = input.toUpperCase().replace(/=+$/, '');
  if (cleaned.length !== 32) return null;
  let bits = '';
  for (const c of cleaned) {
    const idx = alphabet.indexOf(c);
    if (idx < 0) return null;
    bits += idx.toString(2).padStart(5, '0');
  }
  // 32 chars * 5 bits = 160 bits = 20 bytes
  if (bits.length < 160) return null;
  let hex = '';
  for (let i = 0; i < 160; i += 8) {
    hex += parseInt(bits.slice(i, i + 8), 2)
      .toString(16)
      .padStart(2, '0');
  }
  return hex;
}

export function parseMagnetInfohash(uri: string): string | null {
  if (!uri.startsWith('magnet:?')) return null;
  const query = uri.slice('magnet:?'.length);
  const params = new URLSearchParams(query);
  const xts = params.getAll('xt');
  for (const xt of xts) {
    if (!xt.startsWith('urn:btih:')) continue;
    const raw = xt.slice('urn:btih:'.length);
    if (HEX_40_RE.test(raw)) return raw.toLowerCase();
    if (BASE32_32_RE.test(raw)) return base32ToHex(raw);
  }
  return null;
}

const MAX_REDIRECTS = 5;

/** What we can learn about a torrent from its raw bencoded bytes. */
export type ParsedTorrentInfo = {
  /** Lowercase hex sha1 of the bencoded info dict. */
  infohash: string;
  /** Display name from the info dict (`name.utf-8` preferred), when present. */
  name: string | null;
  /** Total payload size from the info dict (0 when indeterminate). */
  sizeBytes: number;
};

function utf8OrNull(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (v instanceof Uint8Array) return Buffer.from(v).toString('utf8');
  return null;
}

/**
 * Decode raw `.torrent` bytes (uploaded file or fetched body): validate the
 * bencode structure, sha1 the re-encoded info dict for the info-hash, and pull
 * out the display name + total size. Throws on anything that isn't a torrent.
 */
export function parseTorrentBytes(bytes: Uint8Array): ParsedTorrentInfo {
  let decoded: unknown;
  try {
    decoded = bencode.decode(Buffer.from(bytes));
  } catch {
    throw new Error('not a bencoded torrent');
  }
  if (decoded === null || typeof decoded !== 'object' || !('info' in decoded)) {
    throw new Error('torrent missing info dict');
  }
  const info = (decoded as { info: unknown }).info;
  if (info === null || typeof info !== 'object') {
    throw new Error('torrent missing info dict');
  }
  const reEncoded = bencode.encode(info as Parameters<typeof bencode.encode>[0]);
  const infohash = createHash('sha1').update(reEncoded).digest('hex');

  const dict = info as Record<string, unknown>;
  const name = utf8OrNull(dict['name.utf-8']) ?? utf8OrNull(dict['name']);
  let sizeBytes = 0;
  if (typeof dict['length'] === 'number') {
    sizeBytes = dict['length'];
  } else if (Array.isArray(dict['files'])) {
    for (const f of dict['files']) {
      const len = (f as Record<string, unknown> | null)?.['length'];
      if (typeof len === 'number') sizeBytes += len;
    }
  }
  return { infohash, name, sizeBytes };
}

/** Convenience wrapper: the info-hash of raw `.torrent` bytes. */
export function computeInfohashFromTorrentBytes(bytes: Uint8Array): string {
  return parseTorrentBytes(bytes).infohash;
}

/**
 * What a download link resolves to, plus its info-hash.
 *  - `magnet`: hand this magnet URI to the download client (NOT the original http
 *     URL — qBittorrent fetches an http "add by URL" expecting a .torrent and
 *     silently drops it when it 302-redirects to a magnet).
 *  - `torrent`: the original http(s) URL serves a real .torrent; hand it to the
 *     client as-is (private trackers like FileList).
 */
export type ResolvedLink =
  | { kind: 'magnet'; magnet: string; infohash: string }
  | { kind: 'torrent'; url: string; torrent: Uint8Array; infohash: string };

/**
 * Resolve a release's HTTP(S) download link to something a torrent client can
 * actually add, plus its info-hash.
 *
 * Private trackers serve a real `.torrent` (bencoded) which we decode. But
 * Prowlarr/Jackett download endpoints for *public magnet* trackers (TPB,
 * LimeTorrents, Knaben, …) 302-redirect to a `magnet:` URI — and some return the
 * magnet as the response *body* instead. The default `fetch` auto-follows
 * redirects and throws on the non-HTTP `magnet:` scheme, so we follow redirects
 * manually and return the magnet when we hit one.
 */
export async function resolveDownloadLink(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<ResolvedLink> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetcher(current, { redirect: 'manual' });

    // Redirect: a magnet target is the answer; an http target is another hop.
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) throw new Error(`redirect ${res.status} without location`);
      if (location.startsWith('magnet:')) {
        const ih = parseMagnetInfohash(location);
        if (!ih) throw new Error('magnet redirect missing btih');
        return { kind: 'magnet', magnet: location, infohash: ih };
      }
      current = new URL(location, current).toString();
      continue;
    }

    if (!res.ok) throw new Error(`fetch torrent failed: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());

    // Some endpoints return the magnet link as the body rather than a .torrent.
    if (buf.subarray(0, 8).toString('latin1').startsWith('magnet:?')) {
      const magnet = buf.toString('utf8').trim();
      const ih = parseMagnetInfohash(magnet);
      if (!ih) throw new Error('magnet body missing btih');
      return { kind: 'magnet', magnet, infohash: ih };
    }

    // Return the raw .torrent bytes so the caller can hand them straight to the
    // download client — qBittorrent often can't re-fetch a private tracker's
    // download URL (network isolation / single-use links), so we add the file.
    return {
      kind: 'torrent',
      url,
      torrent: buf,
      infohash: parseTorrentBytes(buf).infohash,
    };
  }
  throw new Error('too many redirects');
}

/** Convenience wrapper: resolve the link and return only its info-hash. */
export async function computeInfohashFromTorrentUrl(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  return (await resolveDownloadLink(url, fetcher)).infohash;
}
