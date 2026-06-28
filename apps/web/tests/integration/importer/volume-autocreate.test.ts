import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { getDb } from '@/server/db/client';
import { series, volumes } from '@/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { insertSeries } from '@/server/db/series';
import { createGroup } from '@/server/db/library-groups';
import { insertRelease } from '@/server/db/releases';
import { insertDownload } from '@/server/db/downloads';
import { qbtConnectionSetting } from '@/server/db/settings/qbt';
import type * as QbtModuleType from '@/server/integrations/qbittorrent';

// Mock qBittorrent so the importer sees one torrent with a single volume file
// on disk, without touching a real qbt instance.
const SAVE_PATH = { value: '' };
const FILE_NAME = { value: '' };
vi.mock('@/server/integrations/qbittorrent', async () => {
  const actual = await vi.importActual<typeof QbtModuleType>('@/server/integrations/qbittorrent');
  return {
    ...actual,
    listTorrentsInCategory: vi.fn(async () => [
      { hash: 'c'.repeat(40), name: 'T', save_path: SAVE_PATH.value, category: 'cat' },
    ]),
    getTorrentFiles: vi.fn(async () => [{ name: FILE_NAME.value, size: 1234, progress: 1 }]),
  };
});

import { importDownload } from '@/server/importer';

// --- minimal zip writer (mirrors health-check.test.ts) so the health-check
// gate (which opens routed files with the real reader probers) sees genuine,
// non-corrupt archives instead of dummy "content" bytes. ---
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
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(8, 8);
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0, 12);
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

/** A valid OCF epub with a single-item spine. */
function makeEpub(): Buffer {
  const container =
    '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
    '<rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>';
  const opf =
    '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf">' +
    '<manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest>' +
    '<spine><itemref idref="c1"/></spine></package>';
  return makeZip([
    { name: 'META-INF/container.xml', data: Buffer.from(container) },
    { name: 'content.opf', data: Buffer.from(opf) },
    { name: 'c1.xhtml', data: Buffer.from('<html><body>ch1</body></html>') },
  ]);
}

/** A valid cbz with one image entry. */
function makeCbz(): Buffer {
  return makeZip([{ name: '001.png', data: Buffer.from('not-a-real-png-but-named-png') }]);
}

/** Pick valid archive bytes by extension; fall back to a cbz. */
function fixtureFor(fileName: string): Buffer {
  if (fileName.toLowerCase().endsWith('.epub')) return makeEpub();
  return makeCbz();
}

let h: SeedHandle;
let mediaDir: string;
let dlDir: string;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  mediaDir = mkdtempSync(join(tmpdir(), 'bk-media-'));
  dlDir = mkdtempSync(join(tmpdir(), 'bk-dl-'));
  process.env.BOOKKEEPRR_MEDIA_ROOT = mediaDir;
  await qbtConnectionSetting.set({
    host: 'localhost',
    port: 8080,
    username: 'u',
    password: 'p',
    useHttps: false,
  });
  SAVE_PATH.value = dlDir;
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.BOOKKEEPRR_MEDIA_ROOT;
  rmSync(mediaDir, { recursive: true, force: true });
  rmSync(dlDir, { recursive: true, force: true });
  h.cleanup();
});

async function setupImport(opts: {
  granularity: 'volume' | 'chapter';
  fileName: string;
  targetLow: number;
  targetHigh: number;
  groupId?: number;
}): Promise<{ seriesId: number; downloadId: number }> {
  const seriesId = await insertSeries({
    contentType: 'light_novel',
    anilistId: null,
    status: 'releasing',
    rootPath: join(mediaDir, 'books', 'Solo Leveling'),
    qualityProfileId: h.qpId,
    titleEnglish: 'Solo Leveling',
    granularity: opts.granularity,
    novelUpdatesSlug: 'solo-leveling',
    groupId: opts.groupId ?? null,
  });
  // Place the release file on disk in the torrent save_path.
  FILE_NAME.value = opts.fileName;
  mkdirSync(dlDir, { recursive: true });
  writeFileSync(join(dlDir, opts.fileName), fixtureFor(opts.fileName));
  const releaseId = await insertRelease({
    indexerId: h.indexerId,
    indexerGuid: 'g1',
    seriesId,
    title: 'Solo Leveling v3',
    link: 'magnet:?xt=urn:btih:' + 'd'.repeat(40),
    targetKind: 'volume',
    targetLow: opts.targetLow,
    targetHigh: opts.targetHigh,
    groupName: null,
    language: 'en',
    sizeBytes: 1234,
    seeders: 1,
    leechers: 0,
    publishedAt: new Date(),
    score: 0.9,
  });
  const downloadId = await insertDownload({
    releaseId,
    qbtHash: 'c'.repeat(40),
    status: 'completed',
  });
  return { seriesId, downloadId };
}

describe('importer volume auto-create', () => {
  it('creates a missing volume row for a volume-granularity series and imports the file', async () => {
    const { seriesId, downloadId } = await setupImport({
      granularity: 'volume',
      fileName: 'Solo Leveling v03.epub',
      targetLow: 3,
      targetHigh: 3,
    });

    // No volume rows pre-seeded.
    const before = await getDb().select().from(volumes).where(eq(volumes.seriesId, seriesId));
    expect(before).toHaveLength(0);

    const result = await importDownload(downloadId);

    expect(result.imported).toHaveLength(1);
    expect(result.imported[0]!.targetKind).toBe('volume');
    expect(result.imported[0]!.targetNumber).toBe(3);
    expect(result.skipped.filter((s) => s.reason === 'no-target-row')).toHaveLength(0);

    const after = await getDb()
      .select()
      .from(volumes)
      .where(and(eq(volumes.seriesId, seriesId), eq(volumes.number, 3)));
    expect(after).toHaveLength(1);
  });

  it('places the imported file under the group path when the series is grouped', async () => {
    const eng = await createGroup('Engineering', null);
    const arch = await createGroup('Architecture', eng.id);
    const { downloadId } = await setupImport({
      granularity: 'volume',
      fileName: 'Solo Leveling v03.epub',
      targetLow: 3,
      targetHigh: 3,
      groupId: arch.id,
    });

    const result = await importDownload(downloadId);

    expect(result.imported).toHaveLength(1);
    // Default light-novel series_folder '{group_path}/{author}/{series_title} Light Novel'
    // author is null → empty string → double-slash collapsed → groups prefix series dir directly.
    // volume template '{series_title} - v{volume:00} [{group}].{ext}', group null → brackets collapsed.
    expect(result.imported[0]!.path).toBe(
      join(mediaDir, 'books', 'Engineering', 'Architecture', 'Solo Leveling Light Novel', 'Solo Leveling - v03.epub'),
    );
  });

  it('chapter-granularity series still skips when the chapter row is missing', async () => {
    const { seriesId, downloadId } = await setupImport({
      granularity: 'chapter',
      fileName: 'Solo Leveling c03.cbz',
      targetLow: 3,
      targetHigh: 3,
    });
    // Make it a chapter series (granularity already set on insert).
    await getDb().update(series).set({ granularity: 'chapter' }).where(eq(series.id, seriesId));

    const result = await importDownload(downloadId);

    expect(result.imported).toHaveLength(0);
    expect(result.skipped.some((s) => s.reason === 'no-target-row')).toBe(true);
    const vols = await getDb().select().from(volumes).where(eq(volumes.seriesId, seriesId));
    expect(vols).toHaveLength(0);
  });
});
