#!/usr/bin/env node
// Regenerates the tiny, valid reader test fixtures:
//   sample.cbz, sample.epub, sample.pdf, sample.mp3
//
// Pure Node built-ins only (no npm deps, no shelling out to 7z so it runs
// anywhere). ZIP archives are hand-written (local headers + central directory)
// using zlib for deflate. Output is byte-for-byte deterministic across runs:
// no timestamps, no compression nondeterminism (DOS date/time fields are zeroed
// and deflate is fed the same input every time).
//
// Run: node tests/fixtures/reader/make-fixtures.mjs   (from apps/web)
/* eslint-disable no-console */
import { Buffer } from 'node:buffer';

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { deflateRawSync, crc32 } from 'node:zlib';

const OUT_DIR = dirname(fileURLToPath(import.meta.url));
const out = (name) => join(OUT_DIR, name);

// --- crc32 helper (node:zlib exposes it on recent Node; fall back if absent) ---
function crc(buf) {
  if (typeof crc32 === 'function') return crc32(buf) >>> 0;
  // Minimal CRC-32 fallback (IEEE 802.3 polynomial).
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

// ---------------------------------------------------------------------------
// Tiny 1x1 PNG (valid bytes: signature + IHDR + IDAT + IEND).
// 1x1, 8-bit RGB, single black pixel. Verified-correct hex; 69 bytes.
// ---------------------------------------------------------------------------
const TINY_PNG = Buffer.from(
  // signature | IHDR (1x1, 8-bit RGB) | IDAT (deflated black pixel) | IEND
  '89504e470d0a1a0a' +
    '0000000d4948445200000001000000010802000000907753de' +
    '0000000c49444154789c63606060000000040001f6173855' +
    '0000000049454e44ae426082',
  'hex',
);

// ---------------------------------------------------------------------------
// Minimal ZIP writer.
// entries: [{ name, data: Buffer, store: bool }]
// store=true => no compression (method 0); used for the epub mimetype.
// ---------------------------------------------------------------------------
function buildZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const crcVal = crc(e.data);
    const uncompSize = e.data.length;
    let method;
    let payload;
    if (e.store) {
      method = 0;
      payload = e.data;
    } else {
      method = 8;
      payload = deflateRawSync(e.data, { level: 9 });
    }
    const compSize = payload.length;

    // Local file header (30 bytes + name)
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); // signature
    lh.writeUInt16LE(20, 4); // version needed
    lh.writeUInt16LE(0, 6); // flags
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(0, 10); // mod time (zeroed -> deterministic)
    lh.writeUInt16LE(0, 12); // mod date
    lh.writeUInt32LE(crcVal, 14);
    lh.writeUInt32LE(compSize, 18);
    lh.writeUInt32LE(uncompSize, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28); // extra len
    locals.push(lh, nameBuf, payload);

    // Central directory header (46 bytes + name)
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); // signature
    ch.writeUInt16LE(20, 4); // version made by
    ch.writeUInt16LE(20, 6); // version needed
    ch.writeUInt16LE(0, 8); // flags
    ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(0, 12); // mod time
    ch.writeUInt16LE(0, 14); // mod date
    ch.writeUInt32LE(crcVal, 16);
    ch.writeUInt32LE(compSize, 20);
    ch.writeUInt32LE(uncompSize, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30); // extra len
    ch.writeUInt16LE(0, 32); // comment len
    ch.writeUInt16LE(0, 34); // disk number
    ch.writeUInt16LE(0, 36); // internal attrs
    ch.writeUInt32LE(0, 38); // external attrs
    ch.writeUInt32LE(offset, 42); // local header offset
    centrals.push(ch, nameBuf);

    offset += lh.length + nameBuf.length + payload.length;
  }

  const localPart = Buffer.concat(locals);
  const centralPart = Buffer.concat(centrals);

  // End of central directory record
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with cd start
  eocd.writeUInt16LE(entries.length, 8); // entries on disk
  eocd.writeUInt16LE(entries.length, 10); // total entries
  eocd.writeUInt32LE(centralPart.length, 12); // cd size
  eocd.writeUInt32LE(localPart.length, 16); // cd offset
  eocd.writeUInt16LE(0, 20); // comment len

  return Buffer.concat([localPart, centralPart, eocd]);
}

// ---------------------------------------------------------------------------
// sample.cbz — 3 PNG pages + 1 non-image entry (for image-only filtering tests)
// ---------------------------------------------------------------------------
function makeCbz() {
  const zip = buildZip([
    { name: '001.png', data: TINY_PNG },
    { name: '002.png', data: TINY_PNG },
    { name: '003.png', data: TINY_PNG },
    { name: 'cover.txt', data: Buffer.from('not an image\n', 'utf8') },
  ]);
  writeFileSync(out('sample.cbz'), zip);
}

// ---------------------------------------------------------------------------
// sample.epub — EPUB3 with mimetype first/stored, container, OPF, nav, 2 chapters
// ---------------------------------------------------------------------------
function makeEpub() {
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;

  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:bookkeeprr-reader-sample</dc:identifier>
    <dc:title>Sample Reader Book</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="style.css" media-type="text/css"/>
    <item id="img1" href="img1.png" media-type="image/png"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
  </spine>
</package>
`;

  const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title>Table of Contents</title></head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>Table of Contents</h1>
      <ol>
        <li><a href="ch1.xhtml">Chapter One</a></li>
        <li><a href="ch2.xhtml">Chapter Two</a></li>
      </ol>
    </nav>
  </body>
</html>
`;

  const ch1 = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <title>Chapter One</title>
    <link rel="stylesheet" type="text/css" href="style.css"/>
  </head>
  <body>
    <h1>Chapter One</h1>
    <p>The first page opened with a quiet promise of adventure.</p>
    <img src="img1.png" alt="a tiny figure"/>
  </body>
</html>
`;

  const ch2 = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <title>Chapter Two</title>
  </head>
  <body>
    <h1>Chapter Two</h1>
    <p>The second chapter drew the journey gently toward its close.</p>
  </body>
</html>
`;

  const styleCss = `body { font-family: serif; line-height: 1.5; margin: 1em; }
h1 { font-size: 1.4em; }
`;

  const zip = buildZip([
    // mimetype MUST be first and STORED (uncompressed) per the EPUB OCF spec.
    { name: 'mimetype', data: Buffer.from('application/epub+zip', 'utf8'), store: true },
    { name: 'META-INF/container.xml', data: Buffer.from(containerXml, 'utf8') },
    { name: 'OEBPS/content.opf', data: Buffer.from(contentOpf, 'utf8') },
    { name: 'OEBPS/nav.xhtml', data: Buffer.from(navXhtml, 'utf8') },
    { name: 'OEBPS/ch1.xhtml', data: Buffer.from(ch1, 'utf8') },
    { name: 'OEBPS/ch2.xhtml', data: Buffer.from(ch2, 'utf8') },
    { name: 'OEBPS/style.css', data: Buffer.from(styleCss, 'utf8') },
    { name: 'OEBPS/img1.png', data: TINY_PNG },
  ]);
  writeFileSync(out('sample.epub'), zip);
}

// ---------------------------------------------------------------------------
// sample-ns-opf.epub — EPUB2 whose OPF package elements carry an `opf:`
// namespace prefix (<opf:manifest>, <opf:item>, <opf:spine>, <opf:itemref>),
// with an EPUB2 NCX table of contents. Valid per spec; reproduces the
// real-world "Terciel and Elinor" file that the parser wrongly read as empty.
// ---------------------------------------------------------------------------
function makeNamespacedEpub() {
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;

  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<opf:package xmlns:opf="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="bookid">
  <opf:metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:bookkeeprr-ns-opf-sample</dc:identifier>
    <dc:title>Namespaced OPF Sample</dc:title>
    <dc:language>en</dc:language>
  </opf:metadata>
  <opf:manifest>
    <opf:item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <opf:item id="f1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
    <opf:item id="f2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
  </opf:manifest>
  <opf:spine toc="ncx">
    <opf:itemref idref="f1"/>
    <opf:itemref idref="f2"/>
  </opf:spine>
</opf:package>
`;

  const tocNcx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
    <navPoint id="np1" playOrder="1"><navLabel><text>Chapter One</text></navLabel><content src="ch1.xhtml"/></navPoint>
    <navPoint id="np2" playOrder="2"><navLabel><text>Chapter Two</text></navLabel><content src="ch2.xhtml"/></navPoint>
  </navMap>
</ncx>
`;

  const chapter = (n) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter ${n}</title></head>
<body><h1>Chapter ${n}</h1><p>Body ${n}.</p></body></html>
`;

  const zip = buildZip([
    { name: 'mimetype', data: Buffer.from('application/epub+zip', 'utf8'), store: true },
    { name: 'META-INF/container.xml', data: Buffer.from(containerXml, 'utf8') },
    { name: 'OEBPS/content.opf', data: Buffer.from(contentOpf, 'utf8') },
    { name: 'OEBPS/toc.ncx', data: Buffer.from(tocNcx, 'utf8') },
    { name: 'OEBPS/ch1.xhtml', data: Buffer.from(chapter('One'), 'utf8') },
    { name: 'OEBPS/ch2.xhtml', data: Buffer.from(chapter('Two'), 'utf8') },
  ]);
  writeFileSync(out('sample-ns-opf.epub'), zip);
}

// ---------------------------------------------------------------------------
// sample.pdf — minimal valid 2-page PDF with correct xref offsets.
// ---------------------------------------------------------------------------
function makePdf() {
  const header = '%PDF-1.4\n';
  // Object bodies (without their "N 0 obj"/"endobj" wrappers).
  const objBodies = [
    '<< /Type /Catalog /Pages 2 0 R >>', // 1: catalog
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>', // 2: pages
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>', // 3: page 1
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>', // 4: page 2
  ];

  let body = header;
  const offsets = []; // byte offset of each object's "N 0 obj"
  objBodies.forEach((b, i) => {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += `${i + 1} 0 obj\n${b}\nendobj\n`;
  });

  const xrefStart = Buffer.byteLength(body, 'latin1');
  const total = objBodies.length + 1; // +1 for the free object 0
  const pad10 = (n) => String(n).padStart(10, '0');
  let xref = `xref\n0 ${total}\n`;
  xref += `0000000000 65535 f \n`; // free head
  for (const off of offsets) xref += `${pad10(off)} 00000 n \n`;

  const trailer =
    `trailer\n<< /Size ${total} /Root 1 0 R >>\n` +
    `startxref\n${xrefStart}\n%%EOF\n`;

  const pdf = Buffer.from(body + xref + trailer, 'latin1');
  writeFileSync(out('sample.pdf'), pdf);
}

// ---------------------------------------------------------------------------
// sample.mp3 — a few silent MPEG-1 Layer III frames.
// Header 0xFF 0xFB 0x90 0x00: MPEG-1, Layer III, no CRC, 128 kbps, 44.1 kHz,
// no padding, stereo. Frame size = 144 * 128000 / 44100 = 417 bytes.
// ---------------------------------------------------------------------------
function makeMp3() {
  const FRAME_SIZE = 417;
  const FRAMES = 8; // ~0.21s; well under 5KB total.
  const header = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
  const frame = Buffer.alloc(FRAME_SIZE); // zero-filled (silence)
  header.copy(frame, 0);
  const parts = [];
  for (let i = 0; i < FRAMES; i++) parts.push(Buffer.from(frame));
  writeFileSync(out('sample.mp3'), Buffer.concat(parts));
}

makeCbz();
makeEpub();
makeNamespacedEpub();
makePdf();
makeMp3();

console.log('Wrote sample.cbz, sample.epub, sample-ns-opf.epub, sample.pdf, sample.mp3 to', OUT_DIR);
