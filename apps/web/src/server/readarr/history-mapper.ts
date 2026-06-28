export type GrabbedJoinRow = {
  downloadId: number;
  qbtHash: string;
  addedAt: Date;
  releaseTitle: string;
  seriesId: number;
  volumeId: number | null;
};

export type ImportedJoinRow = {
  libraryFileId: number;
  importedAt: Date;
  seriesId: number;
  volumeId: number | null;
  path: string;
  qbtHash: string | null;
};

export type FailedJoinRow = {
  downloadId: number;
  qbtHash: string;
  addedAt: Date;
  releaseTitle: string;
  seriesId: number;
  volumeId: number | null;
  error: string;
};

export type ReadarrHistoryRecord = {
  id: string;
  eventType: 'grabbed' | 'bookFileImported' | 'downloadFailed';
  authorId: number;
  bookId: number | null;
  sourceTitle: string;
  date: string;
  downloadId: string;
  data: Record<string, unknown>;
};

export function downloadGrabbedToHistoryRecord(row: GrabbedJoinRow): ReadarrHistoryRecord {
  return {
    id: `grabbed-${row.downloadId}`,
    eventType: 'grabbed',
    authorId: row.seriesId,
    bookId: row.volumeId,
    sourceTitle: row.releaseTitle,
    date: row.addedAt.toISOString(),
    downloadId: row.qbtHash,
    data: {},
  };
}

export function libraryFileImportedToHistoryRecord(row: ImportedJoinRow): ReadarrHistoryRecord {
  return {
    id: `imported-${row.libraryFileId}`,
    eventType: 'bookFileImported',
    authorId: row.seriesId,
    bookId: row.volumeId,
    sourceTitle: row.path,
    date: row.importedAt.toISOString(),
    downloadId: row.qbtHash ?? '',
    data: {},
  };
}

export function downloadFailedToHistoryRecord(row: FailedJoinRow): ReadarrHistoryRecord {
  return {
    id: `downloadFailed-${row.downloadId}`,
    eventType: 'downloadFailed',
    authorId: row.seriesId,
    bookId: row.volumeId,
    sourceTitle: row.releaseTitle,
    date: row.addedAt.toISOString(),
    downloadId: row.qbtHash,
    data: { message: row.error },
  };
}
