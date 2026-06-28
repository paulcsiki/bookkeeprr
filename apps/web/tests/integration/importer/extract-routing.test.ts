import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { routeFilesWithExtract } from '@/server/importer/routing';
import type { ReleaseRow } from '@/server/db/schema';
import type { QbtFile } from '@/server/integrations/qbittorrent';

const execFileP = promisify(execFile);

const SEVENZIP_BIN = process.env.BOOKKEEPRR_7Z_BIN ?? '7zz';

function fakeRelease(over: Partial<ReleaseRow> = {}): ReleaseRow {
  return {
    id: 1,
    seriesId: 1,
    indexerId: 1,
    indexerGuid: 'g',
    title: 'T',
    link: 'l',
    targetKind: 'batch',
    targetLow: 1,
    targetHigh: 2,
    groupName: null,
    language: 'en',
    sizeBytes: 1000,
    seeders: 0,
    leechers: 0,
    publishedAt: new Date(),
    score: 0.9,
    trusted: null,
    remake: null,
    discoveredAt: null,
    grabFailedAt: null,
    grabAttempts: 0,
    rejectedAt: null,
    rejectionReason: null,
    ...over,
  };
}

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'm14-extract-test-'));
});
afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

async function sevenzAvailable(): Promise<boolean> {
  try {
    await execFileP(SEVENZIP_BIN, ['--help']);
    return true;
  } catch {
    return false;
  }
}

describe('routeFilesWithExtract', () => {
  it('extracts outer .zip and routes inner .cbz files', async () => {
    if (!(await sevenzAvailable())) {
      return; // skip if 7zz isn't on this host
    }
    const cbz1 = join(testDir, 'Vol01.cbz');
    const cbz2 = join(testDir, 'Vol02.cbz');
    await writeFile(cbz1, Buffer.from('fake cbz 1'));
    await writeFile(cbz2, Buffer.from('fake cbz 2'));
    const zipPath = join(testDir, 'pack.zip');
    await execFileP(SEVENZIP_BIN, ['a', zipPath, cbz1, cbz2]);

    const files: QbtFile[] = [{ name: 'pack.zip', size: 100, progress: 1 }];
    const result = await routeFilesWithExtract(
      fakeRelease({ targetKind: 'batch', targetLow: 1, targetHigh: 2 }),
      'volume',
      files,
      () => zipPath,
    );

    expect(result.routed.length).toBeGreaterThanOrEqual(2);
    expect(result.routed.every((r) => r.file.name.endsWith('.cbz'))).toBe(true);
  });

  it('skips outer archive on extract failure (corrupt input)', async () => {
    const badZip = join(testDir, 'corrupt.zip');
    await writeFile(badZip, Buffer.from('not actually a zip'));
    const files: QbtFile[] = [{ name: 'corrupt.zip', size: 100, progress: 1 }];
    const result = await routeFilesWithExtract(fakeRelease(), 'volume', files, () => badZip);
    expect(result.routed).toHaveLength(0);
  });

  it('passes through non-archive files unchanged', async () => {
    const epub = join(testDir, 'book.epub');
    await writeFile(epub, Buffer.from('fake epub'));
    const files: QbtFile[] = [{ name: 'book.epub', size: 100, progress: 1 }];
    const result = await routeFilesWithExtract(
      fakeRelease({ targetKind: 'volume', targetLow: 1, targetHigh: 1 }),
      'volume',
      files,
      () => epub,
    );
    expect(result.routed).toHaveLength(1);
    expect(result.routed[0]!.file.name).toBe('book.epub');
  });
});
