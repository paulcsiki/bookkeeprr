import { describe, expect, it } from 'vitest';
import { formatEvent } from '@/server/notifications/format';
import type { NotifyEvent } from '@/server/notifications/events';
import type { SeriesRow, ReleaseRow } from '@/server/db/schema';

function series(over: Partial<SeriesRow> = {}): SeriesRow {
  return {
    id: 1,
    contentType: 'manga',
    titleEnglish: 'Chainsaw Man',
    titleRomaji: null,
    titleNative: null,
    anilistId: 105778,
    comicvineId: null,
    openlibraryId: null,
    isbn: null,
    asin: null,
    publisher: null,
    startYear: null,
    author: null,
    narrator: null,
    mangadexId: null,
    status: 'releasing',
    coverUrl: null,
    description: null,
    totalVolumes: null,
    totalChapters: null,
    rootPath: '/media/comics/CSM',
    monitoring: 'all',
    granularity: 'volume',
    qualityProfileId: 1,
    extraSearchTermsJson: '[]',
    addedAt: new Date(0),
    updatedAt: new Date(0),
    ...over,
  } as SeriesRow;
}

function release(over: Partial<ReleaseRow> = {}): ReleaseRow {
  return {
    id: 9,
    seriesId: 1,
    indexerId: 1,
    indexerGuid: '42',
    title: '[LH] Chainsaw Man v14',
    link: 'magnet:?xt=urn:btih:abc',
    targetKind: 'volume',
    targetLow: 14,
    targetHigh: 14,
    groupName: 'LH',
    language: 'en',
    sizeBytes: 100 * 1024 * 1024,
    seeders: 12,
    leechers: 1,
    publishedAt: new Date(0),
    score: 0.9,
    ...over,
  } as ReleaseRow;
}

describe('formatEvent', () => {
  it('formats grab-success', () => {
    const ev: NotifyEvent = {
      kind: 'grab-success',
      series: series(),
      release: release(),
      indexerName: 'nyaa.si',
    };
    const out = formatEvent(ev);
    expect(out.title).toBe('Grabbed: Chainsaw Man');
    expect(out.body).toContain('[LH] Chainsaw Man v14');
    expect(out.body).toContain('nyaa.si');
    expect(out.body).toContain('100.0 MiB');
    expect(out.color).toBe(0x3b82f6);
    expect(out.level).toBe('info');
  });

  it('formats import-success (single summary, plural)', () => {
    const ev: NotifyEvent = {
      kind: 'import-success',
      series: series(),
      count: 72,
    };
    const out = formatEvent(ev);
    expect(out.title).toBe('Imported: Chainsaw Man');
    expect(out.body).toBe('Imported 72 files of Chainsaw Man');
    expect(out.color).toBe(0x22c55e);
    expect(out.level).toBe('success');
  });

  it('formats import-success (single file → singular noun)', () => {
    const ev: NotifyEvent = {
      kind: 'import-success',
      series: series(),
      count: 1,
    };
    const out = formatEvent(ev);
    expect(out.body).toBe('Imported 1 file of Chainsaw Man');
  });

  it('formats failure', () => {
    const ev: NotifyEvent = {
      kind: 'failure',
      stage: 'grab',
      series: series(),
      release: release(),
      error: { code: 'qbt-add-failed', message: 'connection refused' },
    };
    const out = formatEvent(ev);
    expect(out.title).toBe('Failure during grab: Chainsaw Man');
    expect(out.body).toContain('[qbt-add-failed]');
    expect(out.body).toContain('connection refused');
    expect(out.color).toBe(0xef4444);
    expect(out.level).toBe('failure');
  });

  it('formats failure with no series', () => {
    const ev: NotifyEvent = {
      kind: 'failure',
      stage: 'import',
      series: null,
      release: null,
      error: { code: 'unknown', message: 'oops' },
    };
    const out = formatEvent(ev);
    expect(out.title).toBe('Failure during import: (no series)');
    expect(out.body).toContain('[unknown]');
  });

  it('formats test', () => {
    const out = formatEvent({ kind: 'test' });
    expect(out.title).toBe('bookkeeprr notification test');
    expect(out.body).toContain('test notification');
    expect(out.color).toBe(0x6b7280);
  });
});
