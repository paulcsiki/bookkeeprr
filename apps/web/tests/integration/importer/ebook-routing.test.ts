import { describe, expect, it } from 'vitest';
import { routeFiles } from '@/server/importer/routing';
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

const f = (name: string, size = 1000): QbtFile => ({ name, size, progress: 1 });

describe('routeFiles — ebook formats', () => {
  it('accepts .epub as single-volume', () => {
    const res = routeFiles(fakeRelease(), 'volume', [f('Project Hail Mary.epub')]);
    expect(res.routed).toHaveLength(1);
    expect(res.skipped).toHaveLength(0);
  });

  it('accepts .mobi, .pdf, .azw3 as single-volume', () => {
    for (const ext of ['mobi', 'pdf', 'azw3']) {
      const res = routeFiles(fakeRelease(), 'volume', [f(`Title.${ext}`)]);
      expect(res.routed, `ext=${ext}`).toHaveLength(1);
    }
  });

  it('still skips unknown extensions like .txt', () => {
    const res = routeFiles(fakeRelease(), 'volume', [f('Notes.txt')]);
    expect(res.routed).toHaveLength(0);
    expect(res.skipped).toHaveLength(1);
  });
});

describe('routeFiles — ebook content type (single-file / combo packs)', () => {
  it('routes an unnumbered single ebook (batch 1-1) to volume 1', () => {
    // refineForSeries turns a single ebook into a batch 1-1; the generic batch
    // path needs a per-file volume number, which a plain "Title.pdf" lacks.
    const rel = fakeRelease({ targetKind: 'batch', targetLow: 1, targetHigh: 1 });
    const res = routeFiles(rel, 'volume', [f('Atomic Habits James Clear.pdf')], 'ebook');
    expect(res.routed).toHaveLength(1);
    expect(res.routed[0]!.targetNumber).toBe(1);
  });

  it('imports the ebook and ignores audio files in an ebook+audiobook combo pack', () => {
    const rel = fakeRelease({ targetKind: 'batch', targetLow: 1, targetHigh: 1 });
    const res = routeFiles(
      rel,
      'volume',
      [
        f('Atomic Habits.epub'),
        f('Audiobooks/Atomic Habits - 01.mp3'),
        f('Audiobooks/Atomic Habits - 02.mp3'),
      ],
      'ebook',
    );
    expect(res.routed).toHaveLength(1);
    expect(res.routed[0]!.file.name).toBe('Atomic Habits.epub');
    expect(res.skipped).toHaveLength(2);
  });
});
