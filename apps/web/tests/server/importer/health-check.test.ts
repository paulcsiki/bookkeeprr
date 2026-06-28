import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import {
  checkFile,
  checkFiles,
  __resetSevenZipProbeForTest,
  __setSevenZipProbeForTest,
} from '@/server/importer/health-check';

const FIXTURES = resolve(__dirname, '../../fixtures/reader');
const CBZ = join(FIXTURES, 'sample.cbz'); // valid: 3 png + 1 txt
const MP3 = join(FIXTURES, 'sample.mp3'); // valid audio
const PDF = join(FIXTURES, 'sample.pdf'); // valid pdf

// --- minimal zip writer (mirrors tests/fixtures/reader/make-fixtures.mjs) ---
// Build a real zip-family container with the given entries so the native zip
// reader can parse it. method 8 = raw deflate (matches zip.ts readEntry).
function crc32(buf: Buffer): number {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]!;
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function makeZip(entries: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const comp = deflateRawSync(e.data);
    const crc = crc32(e.data);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4); // version
    lh.writeUInt16LE(0, 6); // flags
    lh.writeUInt16LE(8, 8); // method = deflate
    lh.writeUInt16LE(0, 10); // time
    lh.writeUInt16LE(0, 12); // date
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(e.data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    const localRecord = Buffer.concat([lh, nameBuf, comp]);
    locals.push(localRecord);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 8);
    ch.writeUInt16LE(8, 10);
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(e.data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([ch, nameBuf]));

    offset += localRecord.length;
  }

  const localBlock = Buffer.concat(locals);
  const centralBlock = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBlock.length, 12);
  eocd.writeUInt32LE(localBlock.length, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([localBlock, centralBlock, eocd]);
}

describe('checkFile', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'hc-'));
    __resetSevenZipProbeForTest();
  });
  afterEach(async () => {
    __resetSevenZipProbeForTest();
    await rm(dir, { recursive: true, force: true });
  });

  it('valid cbz → ok', async () => {
    const r = await checkFile(CBZ, 'manga');
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.format).toBe('cbz');
  });

  it('empty cbz (no images) → bad / no-images', async () => {
    const p = join(dir, 'empty.cbz');
    await writeFile(p, makeZip([{ name: 'readme.txt', data: Buffer.from('hi') }]));
    const r = await checkFile(p, 'manga');
    expect(r.status).toBe('bad');
    if (r.status === 'bad') expect(r.reason).toBe('no-images');
  });

  it('unknown extension (.txt) → bad / unknown-format', async () => {
    const p = join(dir, 'note.txt');
    await writeFile(p, 'hello');
    const r = await checkFile(p, 'ebook');
    expect(r.status).toBe('bad');
    if (r.status === 'bad') expect(r.reason).toBe('unknown-format');
  });

  it('.mp3 with contentType ebook → bad / wrong-format', async () => {
    const r = await checkFile(MP3, 'ebook');
    expect(r.status).toBe('bad');
    if (r.status === 'bad') expect(r.reason).toBe('wrong-format');
  });

  it('.epub with no spine → bad / empty-epub', async () => {
    // A valid OCF zip whose OPF has an empty manifest/spine.
    const container =
      '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
      '<rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>';
    const opf =
      '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf"><manifest></manifest><spine></spine></package>';
    const p = join(dir, 'nospine.epub');
    await writeFile(
      p,
      makeZip([
        { name: 'META-INF/container.xml', data: Buffer.from(container) },
        { name: 'content.opf', data: Buffer.from(opf) },
      ]),
    );
    const r = await checkFile(p, 'ebook');
    expect(r.status).toBe('bad');
    if (r.status === 'bad') expect(r.reason).toBe('empty-epub');
  });

  it('unreadable epub (corrupt container) → bad / unreadable-epub', async () => {
    const p = join(dir, 'bad.epub');
    // a valid zip with no container.xml → parseEpub throws.
    await writeFile(p, makeZip([{ name: 'junk.txt', data: Buffer.from('x') }]));
    const r = await checkFile(p, 'ebook');
    expect(r.status).toBe('bad');
    if (r.status === 'bad') expect(r.reason).toBe('unreadable-epub');
  });

  it('valid audio for audiobook → ok', async () => {
    const r = await checkFile(MP3, 'audiobook');
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.format).toBe('audio');
  });

  it('.cbz for light_novel → ok (cbz scans are valid prose)', async () => {
    const r = await checkFile(CBZ, 'light_novel');
    expect(r.status).toBe('ok');
  });

  it('valid pdf for ebook → ok', async () => {
    const r = await checkFile(PDF, 'ebook');
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.format).toBe('pdf');
  });

  it('.mobi for ebook → inconclusive / no-server-parser (imports, never deleted)', async () => {
    const p = join(dir, 'Sabriel.mobi');
    await writeFile(p, Buffer.from('BOOKMOBI fake header'));
    const r = await checkFile(p, 'ebook');
    expect(r.status).toBe('inconclusive');
    if (r.status === 'inconclusive') expect(r.reason).toBe('no-server-parser');
  });

  it('.azw3 for ebook → inconclusive / no-server-parser', async () => {
    const p = join(dir, 'Sabriel.azw3');
    await writeFile(p, Buffer.from('TPZ3 fake header'));
    const r = await checkFile(p, 'ebook');
    expect(r.status).toBe('inconclusive');
    if (r.status === 'inconclusive') expect(r.reason).toBe('no-server-parser');
  });

  it('missing file → bad / missing', async () => {
    const r = await checkFile(join(dir, 'nope.cbz'), 'manga');
    expect(r.status).toBe('bad');
    if (r.status === 'bad') expect(r.reason).toBe('missing');
  });

  it('.cbr when 7z is unavailable → inconclusive / 7z-unavailable', async () => {
    const p = join(dir, 'vol.cbr');
    await writeFile(p, Buffer.from('Rar!\x1a\x07\x00 not really')); // not a zip-family file
    __setSevenZipProbeForTest(async () => false);
    const r = await checkFile(p, 'comic');
    expect(r.status).toBe('inconclusive');
    if (r.status === 'inconclusive') expect(r.reason).toBe('7z-unavailable');
  });

  it('.cbr when 7z is available but the archive throws → inconclusive / archive-check-failed', async () => {
    const p = join(dir, 'broken.cbr');
    await writeFile(p, Buffer.from('Rar!\x1a\x07\x00 not really')); // 7z would fail to list
    __setSevenZipProbeForTest(async () => true);
    const r = await checkFile(p, 'comic');
    // Bias to NOT delete: a 7z list throw on a non-zip archive is inconclusive.
    expect(r.status).toBe('inconclusive');
    if (r.status === 'inconclusive') expect(r.reason).toBe('archive-check-failed');
  });

  it('corrupt zip-family cbz (bad central dir) → bad / unreadable-archive', async () => {
    const p = join(dir, 'corrupt.cbz');
    // PK magic so isZipFamily passes by ext anyway, but the body is garbage.
    await writeFile(p, Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(40)]));
    const r = await checkFile(p, 'comic');
    expect(r.status).toBe('bad');
    if (r.status === 'bad') expect(r.reason).toBe('unreadable-archive');
  });
});

describe('checkFiles', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'hcf-'));
    __resetSevenZipProbeForTest();
  });
  afterEach(async () => {
    __resetSevenZipProbeForTest();
    await rm(dir, { recursive: true, force: true });
  });

  it('all good → ok:true, no failures', async () => {
    const r = await checkFiles(
      [
        { path: CBZ, name: 'a.cbz' },
        { path: CBZ, name: 'b.cbz' },
      ],
      'manga',
    );
    expect(r.ok).toBe(true);
    expect(r.failures).toEqual([]);
    expect(r.inconclusive).toEqual([]);
  });

  it('empty file list → ok:false (nothing to validate)', async () => {
    const r = await checkFiles([], 'manga');
    expect(r.ok).toBe(false);
  });

  it('a bad file → ok:false with the failure recorded', async () => {
    const bad = join(dir, 'empty.cbz');
    await writeFile(bad, makeZip([{ name: 'r.txt', data: Buffer.from('x') }]));
    const r = await checkFiles(
      [
        { path: CBZ, name: 'good.cbz' },
        { path: bad, name: 'bad.cbz' },
      ],
      'manga',
    );
    expect(r.ok).toBe(false);
    expect(r.failures).toEqual([{ name: 'bad.cbz', reason: 'no-images' }]);
  });

  it('an inconclusive file alone keeps ok:true and does NOT flip ok', async () => {
    const cbr = join(dir, 'vol.cbr');
    await writeFile(cbr, Buffer.from('not a zip'));
    __setSevenZipProbeForTest(async () => false);
    const r = await checkFiles(
      [
        { path: CBZ, name: 'good.cbz' },
        { path: cbr, name: 'vol.cbr' },
      ],
      'comic',
    );
    expect(r.ok).toBe(true);
    expect(r.failures).toEqual([]);
    expect(r.inconclusive).toEqual([{ name: 'vol.cbr', reason: '7z-unavailable' }]);
  });

  it('a bad AND an inconclusive file → ok:false, both recorded', async () => {
    const bad = join(dir, 'empty.cbz');
    await writeFile(bad, makeZip([{ name: 'r.txt', data: Buffer.from('x') }]));
    const cbr = join(dir, 'vol.cbr');
    await writeFile(cbr, Buffer.from('not a zip'));
    __setSevenZipProbeForTest(async () => false);
    const r = await checkFiles(
      [
        { path: bad, name: 'bad.cbz' },
        { path: cbr, name: 'vol.cbr' },
      ],
      'comic',
    );
    expect(r.ok).toBe(false);
    expect(r.failures).toEqual([{ name: 'bad.cbz', reason: 'no-images' }]);
    expect(r.inconclusive).toEqual([{ name: 'vol.cbr', reason: '7z-unavailable' }]);
  });
});
