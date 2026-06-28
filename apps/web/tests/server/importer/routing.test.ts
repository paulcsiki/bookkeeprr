import { describe, expect, it } from 'vitest';
import { routeFiles } from '@/server/importer/routing';
import type { QbtFile } from '@/server/integrations/qbittorrent';
import type { ReleaseRow } from '@/server/db/schema';

function release(over: Partial<ReleaseRow>): ReleaseRow {
  return {
    id: 1,
    seriesId: 1,
    indexerId: 1,
    indexerGuid: 'g1',
    title: 'fake',
    link: 'magnet:?xt=urn:btih:x',
    targetKind: 'volume',
    targetLow: 1,
    targetHigh: 1,
    groupName: 'Group',
    language: 'en',
    sizeBytes: 0,
    seeders: 0,
    leechers: 0,
    publishedAt: new Date(),
    score: null,
    ...over,
  } as ReleaseRow;
}

const f = (name: string, size = 1_000_000): QbtFile => ({ name, size, progress: 1 });

describe('routeFiles — single target', () => {
  it('routes all archive files to the single target', () => {
    const r = release({ targetKind: 'volume', targetLow: 5, targetHigh: 5 });
    const result = routeFiles(r, 'volume', [
      f('Series v05 [G].cbz'),
      f('Series v05 [G].cbr'),
      f('cover.jpg'),
    ]);
    expect(result.routed).toHaveLength(2);
    expect(result.routed.every((x) => x.targetKind === 'volume' && x.targetNumber === 5)).toBe(
      true,
    );
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.reason).toBe('unmatched');
  });

  it('chapter single target routes everything to that chapter', () => {
    const r = release({ targetKind: 'chapter', targetLow: 42, targetHigh: 42 });
    const result = routeFiles(r, 'chapter', [f('Series c042 [G].cbz')]);
    expect(result.routed).toHaveLength(1);
    expect(result.routed[0]).toMatchObject({ targetKind: 'chapter', targetNumber: 42 });
  });
});

describe('routeFiles — batch', () => {
  it('routes each volume file by M5 parser', () => {
    const r = release({ targetKind: 'batch', targetLow: 1, targetHigh: 5 });
    const result = routeFiles(r, 'volume', [
      f('Series v01 [G].cbz'),
      f('Series v02 [G].cbz'),
      f('Series v05 [G].cbz'),
      f('Series v99 [G].cbz'), // out of range → unmatched
      f('readme.txt'), // non-archive
    ]);
    expect(result.routed.map((x) => x.targetNumber).sort()).toEqual([1, 2, 5]);
    expect(result.skipped.map((s) => s.sourceName).sort()).toEqual([
      'Series v99 [G].cbz',
      'readme.txt',
    ]);
  });

  it('routes chapter batches by M5 parser', () => {
    const r = release({ targetKind: 'batch', targetLow: 1, targetHigh: 10 });
    const result = routeFiles(r, 'chapter', [
      f('Series c001 [G].cbz'),
      f('Series c002 [G].cbz'),
      f('Series c100 [G].cbz'),
    ]);
    expect(result.routed.map((x) => x.targetNumber).sort()).toEqual([1, 2]);
    expect(result.skipped).toHaveLength(1);
  });

  it('open batch (null range, e.g. a "Complete" pack) routes each file by its parsed number', () => {
    const r = release({ targetKind: 'batch', targetLow: null, targetHigh: null });
    const result = routeFiles(r, 'volume', [
      f('Bunny Drop - Volume 01.cbz'),
      f('Bunny Drop - Volume 02.cbz'),
      f('Series v07.cbz'),
      f('Series Complete Collection.cbz'), // no parseable number → skipped
    ]);
    expect(result.routed.map((x) => x.targetNumber).sort((a, b) => a - b)).toEqual([1, 2, 7]);
    expect(result.routed.every((x) => x.targetKind === 'volume')).toBe(true);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.sourceName).toBe('Series Complete Collection.cbz');
  });
});
