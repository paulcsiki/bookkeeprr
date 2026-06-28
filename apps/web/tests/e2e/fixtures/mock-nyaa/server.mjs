// Mock Nyaa RSS server for the acquisition-pipeline e2e (slice 2).
//
// Surface:
//   GET /?page=rss&q=...&c=...      → Nyaa-style RSS with one matching item
//                                     (we ignore the query — the test only
//                                     asks for the canonical series anyway).
//   GET /download/release.torrent   → a real .torrent file with a WebSeed
//                                     URL pointing at /dl/payload.bin.
//   GET /dl/payload.bin             → the WebSeed payload (16 KiB of 0xAA).
//   GET /tracker?...                → minimal HTTP tracker: empty peers.
//                                     qBit falls back to the WebSeed.
//   GET /healthz                    → 200 OK for compose healthcheck.
//
// The torrent is built once at startup so the info-hash advertised in the
// RSS matches the .torrent exactly.

import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT ?? 8080);
const RELEASE_TITLE = 'Mock Test Series v01 (2024) (Digital) (mock).cbz';
const PAYLOAD_LEN = 16 * 1024;
const PIECE_LENGTH = 16 * 1024;

const PAYLOAD = Buffer.alloc(PAYLOAD_LEN, 0xaa);
const PIECES = crypto.createHash('sha1').update(PAYLOAD).digest(); // single 20-byte SHA-1

// --- minimal bencoder ----------------------------------------------------
function benc(v) {
  if (Buffer.isBuffer(v)) return Buffer.concat([Buffer.from(`${v.length}:`), v]);
  if (typeof v === 'string') return benc(Buffer.from(v, 'utf-8'));
  if (typeof v === 'number') return Buffer.from(`i${Math.trunc(v)}e`);
  if (Array.isArray(v)) return Buffer.concat([Buffer.from('l'), ...v.map(benc), Buffer.from('e')]);
  if (v && typeof v === 'object') {
    const keys = Object.keys(v).sort();
    return Buffer.concat([
      Buffer.from('d'),
      ...keys.flatMap((k) => [benc(k), benc(v[k])]),
      Buffer.from('e'),
    ]);
  }
  throw new Error(`bencode: unsupported value ${typeof v}`);
}

const PAYLOAD_NAME = RELEASE_TITLE;
const info = {
  length: PAYLOAD_LEN,
  name: PAYLOAD_NAME,
  'piece length': PIECE_LENGTH,
  pieces: PIECES,
};
const infoBytes = benc(info);
const infoHashHex = crypto.createHash('sha1').update(infoBytes).digest('hex');

// `url-list` is a flat string for a single WebSeed, per BEP-19.
// `announce` points at our own minimal tracker so qBit doesn't refuse the torrent.
function torrent(host) {
  return benc({
    announce: `http://${host}/tracker`,
    info,
    'url-list': `http://${host}/dl/payload.bin`,
    'created by': 'bookkeeprr e2e mock-nyaa',
    'creation date': 0,
  });
}

function rss(host) {
  // Nyaa's RSS feed shape (see apps/web/src/server/integrations/nyaa/schemas.ts).
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:nyaa="https://nyaa.si/xmlns/nyaa">
  <channel>
    <title>Mock Nyaa (e2e)</title>
    <link>http://${host}/</link>
    <description>e2e fixture</description>
    <item>
      <title>${RELEASE_TITLE}</title>
      <link>http://${host}/download/release.torrent</link>
      <guid isPermaLink="true">http://${host}/view/1</guid>
      <pubDate>Mon, 29 May 2026 12:00:00 +0000</pubDate>
      <nyaa:seeders>42</nyaa:seeders>
      <nyaa:leechers>3</nyaa:leechers>
      <nyaa:downloads>100</nyaa:downloads>
      <nyaa:infoHash>${infoHashHex}</nyaa:infoHash>
      <nyaa:categoryId>3_1</nyaa:categoryId>
      <nyaa:size>16 KiB</nyaa:size>
      <nyaa:trusted>No</nyaa:trusted>
      <nyaa:remake>No</nyaa:remake>
    </item>
  </channel>
</rss>`;
}

const server = http.createServer((req, res) => {
  const host = req.headers.host ?? `mock-nyaa:${PORT}`;
  const url = new URL(req.url ?? '/', `http://${host}`);

  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }

  if (url.pathname === '/' && url.searchParams.get('page') === 'rss') {
    const body = rss(host);
    res.writeHead(200, {
      'content-type': 'application/xml; charset=utf-8',
      'content-length': Buffer.byteLength(body),
    });
    res.end(body);
    return;
  }

  if (url.pathname === '/download/release.torrent') {
    const body = torrent(host);
    res.writeHead(200, {
      'content-type': 'application/x-bittorrent',
      'content-length': body.length,
    });
    res.end(body);
    return;
  }

  if (url.pathname === '/dl/payload.bin') {
    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-length': PAYLOAD.length,
    });
    res.end(PAYLOAD);
    return;
  }

  if (url.pathname === '/tracker') {
    // bencoded { interval: 1800, peers: '' } — empty peer list. qBit will then
    // serve the file from the WebSeed URL.
    const body = Buffer.from('d8:intervali1800e5:peers0:e');
    res.writeHead(200, { 'content-type': 'text/plain', 'content-length': body.length });
    res.end(body);
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, '0.0.0.0', () => {
  process.stdout.write(`mock-nyaa listening on ${PORT} (info-hash ${infoHashHex})\n`);
});
