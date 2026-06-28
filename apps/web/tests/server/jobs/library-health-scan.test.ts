import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { getDb } from '@/server/db/client';
import { libraryFiles, jobs } from '@/server/db/schema';
import { insertRelease, getRelease } from '@/server/db/releases';
import { getLibraryFile } from '@/server/db/library-files';
import { enqueueJob, getJob, listJobsByKind } from '@/server/db/jobs';
import { runOnce, runUntilIdle } from '@/server/jobs/runner';
import {
  libraryHealthScanDescriptor,
  type LibraryHealthScanResult,
} from '@/server/jobs/kinds/library-health-scan';
import {
  libraryHealthScanDrainEntry,
  libraryHealthScanWeeklyEntry,
} from '@/server/jobs/scheduler';
import {
  __setSevenZipProbeForTest,
  __resetSevenZipProbeForTest,
} from '@/server/importer/health-check';
import { eq } from 'drizzle-orm';

const FIXTURES = resolve(__dirname, '../../fixtures/reader');
const SAMPLE_CBZ = join(FIXTURES, 'sample.cbz'); // valid: 3 png + 1 txt

// --- minimal zip writer (mirrors health-check.test.ts / make-fixtures.mjs) ---
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

let h: SeedHandle;
let mediaRoot: string;
let comicsDir: string;
let originalMediaRoot: string | undefined;

beforeEach(async () => {
  h = await seedDb(); // default series is manga, volume 1 seeded
  mediaRoot = mkdtempSync(join(tmpdir(), 'bk-hscan-'));
  comicsDir = join(mediaRoot, 'comics');
  mkdirSync(comicsDir, { recursive: true });
  originalMediaRoot = process.env.BOOKKEEPRR_MEDIA_ROOT;
  process.env.BOOKKEEPRR_MEDIA_ROOT = mediaRoot;
  __resetSevenZipProbeForTest();
});

afterEach(() => {
  rmSync(mediaRoot, { recursive: true, force: true });
  if (originalMediaRoot === undefined) delete process.env.BOOKKEEPRR_MEDIA_ROOT;
  else process.env.BOOKKEEPRR_MEDIA_ROOT = originalMediaRoot;
  __resetSevenZipProbeForTest();
  h.cleanup();
});

async function seedFile(
  path: string,
  sourceReleaseId: number | null,
): Promise<number> {
  const [row] = await getDb()
    .insert(libraryFiles)
    .values({
      seriesId: h.seriesId,
      volumeId: h.volumeId,
      chapterId: null,
      path,
      sizeBytes: 1,
      sourceReleaseId,
    })
    .returning({ id: libraryFiles.id });
  return row!.id;
}

async function runScan(): Promise<LibraryHealthScanResult> {
  await enqueueJob('library_health_scan', {});
  const ran = await runOnce(libraryHealthScanDescriptor);
  expect(ran).toBe('ran');
  const rows = await listJobsByKind('library_health_scan');
  const latest = rows[rows.length - 1]!;
  const job = await getJob(latest.id);
  expect(job!.status).toBe('completed');
  return JSON.parse(job!.resultJson!) as LibraryHealthScanResult;
}

describe('library_health_scan job', () => {
  it('deletes only the bad file, leaves good + inconclusive untouched, re-grabs the series', async () => {
    // 7z unavailable → the .cbr is INCONCLUSIVE (must never be deleted).
    __setSevenZipProbeForTest(async () => false);

    // GOOD: a valid cbz (3 images).
    const goodPath = join(comicsDir, 'good.cbz');
    copyFileSync(SAMPLE_CBZ, goodPath);
    const goodId = await seedFile(goodPath, null);

    // BAD: a real zip with no images → checkFile → bad/no-images.
    const badPath = join(comicsDir, 'bad.cbz');
    writeFileSync(badPath, makeZip([{ name: 'readme.txt', data: Buffer.from('no images') }]));
    const badReleaseId = await insertRelease({
      seriesId: h.seriesId,
      indexerId: h.indexerId,
      indexerGuid: 'g-bad-scan',
      title: 'Bad Release [Group]',
      link: 'magnet:?xt=urn:btih:badscan',
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      groupName: 'Group',
      language: 'en',
      sizeBytes: 100,
      seeders: 1,
      leechers: 0,
      publishedAt: new Date(),
      score: 10,
    });
    const badId = await seedFile(badPath, badReleaseId);

    // INCONCLUSIVE: a .cbr the checker can't validate without 7z.
    const inconPath = join(comicsDir, 'incon.cbr');
    writeFileSync(inconPath, Buffer.from('Rar!\x1a\x07\x00 not a real rar'));
    const inconId = await seedFile(inconPath, null);

    const result = await runScan();

    expect(result).toMatchObject({
      bad: 1,
      deleted: 1,
      inconclusive: 1,
      seriesRequeued: 1,
    });
    expect(result.scanned).toBe(3);

    // BAD: row gone + file deleted on disk.
    expect(await getLibraryFile(badId)).toBeNull();
    expect(existsSync(badPath)).toBe(false);
    // BAD: its source release is now blacklisted.
    const rel = await getRelease(badReleaseId);
    expect(rel?.rejectedAt).not.toBeNull();

    // GOOD: row + file untouched.
    expect(await getLibraryFile(goodId)).not.toBeNull();
    expect(existsSync(goodPath)).toBe(true);

    // INCONCLUSIVE: row + file BOTH untouched (the safety property).
    expect(await getLibraryFile(inconId)).not.toBeNull();
    expect(existsSync(inconPath)).toBe(true);

    // A series-release-search job was enqueued for the affected series.
    const requeued = await getDb()
      .select()
      .from(jobs)
      .where(eq(jobs.kind, 'series_release_search'));
    expect(requeued.length).toBe(1);
    const payload = JSON.parse(requeued[0]!.payloadJson) as { seriesId: number };
    expect(payload.seriesId).toBe(h.seriesId);
  });

  it('is a no-op (zero counts) on an empty library', async () => {
    const result = await runScan();
    expect(result.scanned).toBe(0);
    expect(result.bad).toBe(0);
    expect(result.deleted).toBe(0);
    expect(result.inconclusive).toBe(0);
    expect(result.seriesRequeued).toBe(0);
  });

  it('on-demand job is drainable via runUntilIdle without a weekly cron tick', async () => {
    // Simulate POST /api/library/health-scan: enqueue a job, then drain it.
    await enqueueJob('library_health_scan', {});
    const ran = await runUntilIdle(libraryHealthScanDescriptor);
    expect(ran).toBeGreaterThanOrEqual(1);

    const rows = await listJobsByKind('library_health_scan');
    expect(rows[rows.length - 1]!.status).toBe('completed');
  });
});

describe('library_health_scan scheduler config', () => {
  it('has a minute-cadence drain entry so on-demand jobs are picked up within a minute', () => {
    expect(libraryHealthScanDrainEntry.cronExpression).toBe('* * * * *');
    expect(libraryHealthScanDrainEntry.drain).toBe(true);
    expect(libraryHealthScanDrainEntry.enqueuePayload).toBeUndefined();
    expect(libraryHealthScanDrainEntry.descriptor.kind).toBe('library_health_scan');
  });

  it('has a separate weekly entry that auto-enqueues the scan but does not drain directly', () => {
    expect(libraryHealthScanWeeklyEntry.cronExpression).toBe('0 5 * * 0');
    expect(typeof libraryHealthScanWeeklyEntry.enqueuePayload).toBe('function');
    // The weekly entry should NOT drain — the minute-cadence drain entry handles that.
    expect(libraryHealthScanWeeklyEntry.drain).toBeFalsy();
    expect(libraryHealthScanWeeklyEntry.descriptor.kind).toBe('library_health_scan');
  });
});
