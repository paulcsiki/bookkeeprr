import { describe, expect, it } from 'vitest';
import { downloadRowToQueueRecord, type QueueJoinRow } from '@/server/readarr/queue-mapper';

function makeRow(over: Partial<QueueJoinRow> = {}): QueueJoinRow {
  return {
    downloadId: 1,
    downloadStatus: 'downloading',
    downloadAddedAt: new Date('2026-05-24T10:00:00Z'),
    downloadError: null,
    qbtHash: 'abc123',
    releaseTitle: 'Foo v01 (2024)',
    releaseSizeBytes: 1024 * 1024,
    seriesId: 10,
    indexerName: 'Nyaa',
    volumeId: 100,
    ...over,
  };
}

describe('downloadRowToQueueRecord', () => {
  it('maps a downloading row', () => {
    const r = downloadRowToQueueRecord(makeRow());
    expect(r.id).toBe(1);
    expect(r.authorId).toBe(10);
    expect(r.bookId).toBe(100);
    expect(r.size).toBe(1024 * 1024);
    expect(r.sizeleft).toBe(0);
    expect(r.timeleft).toBe('00:00:00');
    expect(r.estimatedCompletionTime).toBeNull();
    expect(r.title).toBe('Foo v01 (2024)');
    expect(r.status).toBe('downloading');
    expect(r.trackedDownloadState).toBe('downloading');
    expect(r.trackedDownloadStatus).toBe('ok');
    expect(r.downloadId).toBe('abc123');
    expect(r.indexer).toBe('Nyaa');
    expect(r.protocol).toBe('torrent');
    expect(r.downloadClient).toBe('qBittorrent');
    expect(r.errorMessage).toBeNull();
  });

  it('maps queued', () => {
    const r = downloadRowToQueueRecord(makeRow({ downloadStatus: 'queued' }));
    expect(r.status).toBe('queued');
    expect(r.trackedDownloadState).toBe('downloading');
  });

  it('maps importing', () => {
    const r = downloadRowToQueueRecord(makeRow({ downloadStatus: 'importing' }));
    expect(r.status).toBe('importPending');
    expect(r.trackedDownloadState).toBe('importing');
  });

  it('maps completed', () => {
    const r = downloadRowToQueueRecord(makeRow({ downloadStatus: 'completed' }));
    expect(r.status).toBe('completed');
    expect(r.trackedDownloadState).toBe('imported');
  });

  it('maps failed with error message', () => {
    const r = downloadRowToQueueRecord(
      makeRow({ downloadStatus: 'failed', downloadError: 'qbt rejected magnet' }),
    );
    expect(r.status).toBe('failed');
    expect(r.trackedDownloadState).toBe('downloadFailed');
    expect(r.trackedDownloadStatus).toBe('error');
    expect(r.errorMessage).toBe('qbt rejected magnet');
  });

  it('emits bookId=null when volumeId is null', () => {
    const r = downloadRowToQueueRecord(makeRow({ volumeId: null }));
    expect(r.bookId).toBeNull();
  });
});
