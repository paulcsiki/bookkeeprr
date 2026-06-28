import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { routeFiles, routeFilesWithExtract } from '@/server/importer/routing';
import type { ReleaseRow } from '@/server/db/schema';
import type { QbtFile } from '@/server/integrations/qbittorrent';

function fakeRelease(over: Partial<ReleaseRow> = {}): ReleaseRow {
  return {
    id: 1,
    seriesId: 1,
    indexerId: 1,
    indexerGuid: 'g',
    title: 'T',
    link: 'l',
    targetKind: 'volume',
    targetLow: 1,
    targetHigh: 1,
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

const file = (name: string, size = 1000): QbtFile => ({ name, size, progress: 1 });

describe('routeFiles — audiobook short-circuit', () => {
  it('routes single .m4b to volume 1', () => {
    const res = routeFiles(fakeRelease(), 'volume', [file('Project Hail Mary.m4b')], 'audiobook');
    expect(res.routed).toHaveLength(1);
    expect(res.routed[0]!.targetKind).toBe('volume');
    expect(res.routed[0]!.targetNumber).toBe(1);
  });

  it('routes all MP3s in a multi-file audiobook to volume 1', () => {
    const res = routeFiles(
      fakeRelease(),
      'volume',
      [file('Chapter01.mp3'), file('Chapter02.mp3'), file('Chapter03.mp3'), file('Chapter04.mp3')],
      'audiobook',
    );
    expect(res.routed).toHaveLength(4);
    expect(res.routed.every((r) => r.targetNumber === 1)).toBe(true);
  });

  it('skips non-audio files in an audiobook torrent', () => {
    const res = routeFiles(
      fakeRelease(),
      'volume',
      [file('book.m4b'), file('cover.jpg'), file('notes.txt')],
      'audiobook',
    );
    expect(res.routed).toHaveLength(1);
    expect(res.skipped).toHaveLength(2);
    expect(res.skipped.map((s) => s.sourceName).sort()).toEqual(['cover.jpg', 'notes.txt']);
  });

  it('accepts .m4a, .aac, .flac, .ogg as audio', () => {
    for (const ext of ['m4a', 'aac', 'flac', 'ogg']) {
      const res = routeFiles(fakeRelease(), 'volume', [file(`book.${ext}`)], 'audiobook');
      expect(res.routed, `ext=${ext}`).toHaveLength(1);
    }
  });

  it('without audiobook contentType, falls through to existing routing (single-volume)', () => {
    const res = routeFiles(fakeRelease(), 'volume', [file('Title v01.cbz')], 'manga');
    expect(res.routed).toHaveLength(1);
    expect(res.routed[0]!.targetNumber).toBe(1);
  });
});

describe('routeFilesWithExtract — audiobook content type', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'm15-audiobook-routing-'));
  });
  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('routes single .m4b file with audiobook contentType', async () => {
    const m4b = join(testDir, 'Project Hail Mary.m4b');
    await writeFile(m4b, Buffer.from('fake audiobook'));
    const result = await routeFilesWithExtract(
      fakeRelease({ targetKind: 'volume', targetLow: 1, targetHigh: 1 }),
      'volume',
      [{ name: 'Project Hail Mary.m4b', size: 14, progress: 1 }],
      () => m4b,
      'audiobook',
    );
    expect(result.routed).toHaveLength(1);
    expect(result.routed[0]!.targetNumber).toBe(1);
  });

  it('routes multi-file MP3 audiobook with all files to volume 1', async () => {
    const mp3s = ['Chapter01.mp3', 'Chapter02.mp3', 'Chapter03.mp3'];
    for (const f of mp3s) {
      await writeFile(join(testDir, f), Buffer.from('fake mp3'));
    }
    const result = await routeFilesWithExtract(
      fakeRelease({ targetKind: 'volume', targetLow: 1, targetHigh: 1 }),
      'volume',
      mp3s.map((name) => ({ name, size: 8, progress: 1 })),
      (f) => join(testDir, f.name),
      'audiobook',
    );
    expect(result.routed).toHaveLength(3);
    expect(result.routed.every((r) => r.targetNumber === 1)).toBe(true);
  });

  it('skips PDF companion in audiobook torrent', async () => {
    const m4b = join(testDir, 'book.m4b');
    const pdf = join(testDir, 'companion.pdf');
    await writeFile(m4b, Buffer.from('audio'));
    await writeFile(pdf, Buffer.from('pdf'));
    const result = await routeFilesWithExtract(
      fakeRelease(),
      'volume',
      [
        { name: 'book.m4b', size: 5, progress: 1 },
        { name: 'companion.pdf', size: 3, progress: 1 },
      ],
      (f) => join(testDir, f.name),
      'audiobook',
    );
    expect(result.routed).toHaveLength(1);
    expect(result.routed[0]!.file.name).toBe('book.m4b');
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.sourceName).toBe('companion.pdf');
  });
});
