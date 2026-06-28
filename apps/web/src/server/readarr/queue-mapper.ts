export type QueueJoinRow = {
  downloadId: number;
  downloadStatus:
    | 'queued'
    | 'downloading'
    | 'completed'
    | 'importing'
    | 'imported'
    | 'failed'
    | 'superseded';
  downloadAddedAt: Date;
  downloadError: string | null;
  qbtHash: string;
  releaseTitle: string;
  releaseSizeBytes: number;
  seriesId: number;
  indexerName: string;
  volumeId: number | null;
};

export type ReadarrQueueRecord = {
  id: number;
  authorId: number;
  bookId: number | null;
  size: number;
  sizeleft: number;
  timeleft: string;
  estimatedCompletionTime: string | null;
  title: string;
  status: 'queued' | 'downloading' | 'importPending' | 'completed' | 'failed';
  trackedDownloadStatus: 'ok' | 'warning' | 'error';
  trackedDownloadState: 'downloading' | 'importing' | 'imported' | 'downloadFailed';
  statusMessages: { title: string; messages: string[] }[];
  downloadId: string;
  protocol: 'torrent';
  downloadClient: 'qBittorrent';
  indexer: string;
  outputPath: string;
  errorMessage: string | null;
};

function mapStatus(status: QueueJoinRow['downloadStatus']): {
  status: ReadarrQueueRecord['status'];
  trackedDownloadState: ReadarrQueueRecord['trackedDownloadState'];
  trackedDownloadStatus: ReadarrQueueRecord['trackedDownloadStatus'];
} {
  switch (status) {
    case 'queued':
      return { status: 'queued', trackedDownloadState: 'downloading', trackedDownloadStatus: 'ok' };
    case 'downloading':
      return {
        status: 'downloading',
        trackedDownloadState: 'downloading',
        trackedDownloadStatus: 'ok',
      };
    case 'importing':
      return {
        status: 'importPending',
        trackedDownloadState: 'importing',
        trackedDownloadStatus: 'ok',
      };
    case 'completed':
      return {
        status: 'completed',
        trackedDownloadState: 'imported',
        trackedDownloadStatus: 'ok',
      };
    case 'imported':
      return {
        status: 'completed',
        trackedDownloadState: 'imported',
        trackedDownloadStatus: 'ok',
      };
    case 'failed':
      return {
        status: 'failed',
        trackedDownloadState: 'downloadFailed',
        trackedDownloadStatus: 'error',
      };
    case 'superseded':
      // Cancelled in favour of a better release that already covered the same
      // target(s). Surface as a finished item, not an active download.
      return {
        status: 'completed',
        trackedDownloadState: 'imported',
        trackedDownloadStatus: 'ok',
      };
  }
}

export function downloadRowToQueueRecord(row: QueueJoinRow): ReadarrQueueRecord {
  const m = mapStatus(row.downloadStatus);
  return {
    id: row.downloadId,
    authorId: row.seriesId,
    bookId: row.volumeId,
    size: row.releaseSizeBytes,
    sizeleft: 0,
    timeleft: '00:00:00',
    estimatedCompletionTime: null,
    title: row.releaseTitle,
    status: m.status,
    trackedDownloadStatus: m.trackedDownloadStatus,
    trackedDownloadState: m.trackedDownloadState,
    statusMessages: [],
    downloadId: row.qbtHash,
    protocol: 'torrent',
    downloadClient: 'qBittorrent',
    indexer: row.indexerName,
    outputPath: '',
    errorMessage: row.downloadError,
  };
}
