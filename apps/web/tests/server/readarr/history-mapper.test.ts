import { describe, expect, it } from 'vitest';
import {
  downloadGrabbedToHistoryRecord,
  libraryFileImportedToHistoryRecord,
  downloadFailedToHistoryRecord,
  type GrabbedJoinRow,
  type ImportedJoinRow,
  type FailedJoinRow,
} from '@/server/readarr/history-mapper';

describe('downloadGrabbedToHistoryRecord', () => {
  it('maps a grabbed event', () => {
    const row: GrabbedJoinRow = {
      downloadId: 1,
      qbtHash: 'abc',
      addedAt: new Date('2026-05-24T10:00:00Z'),
      releaseTitle: 'Foo v01',
      seriesId: 10,
      volumeId: 100,
    };
    const r = downloadGrabbedToHistoryRecord(row);
    expect(r.id).toBe('grabbed-1');
    expect(r.eventType).toBe('grabbed');
    expect(r.authorId).toBe(10);
    expect(r.bookId).toBe(100);
    expect(r.downloadId).toBe('abc');
    expect(r.sourceTitle).toBe('Foo v01');
    expect(r.date).toBe('2026-05-24T10:00:00.000Z');
  });
});

describe('libraryFileImportedToHistoryRecord', () => {
  it('maps an imported event', () => {
    const row: ImportedJoinRow = {
      libraryFileId: 5,
      importedAt: new Date('2026-05-24T11:00:00Z'),
      seriesId: 10,
      volumeId: 100,
      path: '/media/books/A/Foo v01.epub',
      qbtHash: null,
    };
    const r = libraryFileImportedToHistoryRecord(row);
    expect(r.id).toBe('imported-5');
    expect(r.eventType).toBe('bookFileImported');
    expect(r.authorId).toBe(10);
    expect(r.bookId).toBe(100);
    expect(r.sourceTitle).toBe('/media/books/A/Foo v01.epub');
    expect(r.date).toBe('2026-05-24T11:00:00.000Z');
    expect(r.downloadId).toBe('');
  });

  it('emits bookId=null when volumeId is null', () => {
    const row: ImportedJoinRow = {
      libraryFileId: 5,
      importedAt: new Date(),
      seriesId: 10,
      volumeId: null,
      path: '/media/books/A/Foo.epub',
      qbtHash: null,
    };
    const r = libraryFileImportedToHistoryRecord(row);
    expect(r.bookId).toBeNull();
  });
});

describe('downloadFailedToHistoryRecord', () => {
  it('maps a failed event', () => {
    const row: FailedJoinRow = {
      downloadId: 2,
      qbtHash: 'def',
      addedAt: new Date('2026-05-24T09:00:00Z'),
      releaseTitle: 'Bar v01',
      seriesId: 11,
      volumeId: null,
      error: 'qbt unreachable',
    };
    const r = downloadFailedToHistoryRecord(row);
    expect(r.id).toBe('downloadFailed-2');
    expect(r.eventType).toBe('downloadFailed');
    expect(r.authorId).toBe(11);
    expect(r.bookId).toBeNull();
    expect(r.sourceTitle).toBe('Bar v01');
    expect(r.downloadId).toBe('def');
    expect(r.data).toEqual({ message: 'qbt unreachable' });
  });
});
