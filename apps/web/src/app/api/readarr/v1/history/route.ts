import { NextResponse } from 'next/server';
import { listGrabbedForHistory, listFailedForHistory } from '@/server/db/downloads';
import { listImportedForHistory } from '@/server/db/library-files';
import {
  downloadGrabbedToHistoryRecord,
  libraryFileImportedToHistoryRecord,
  downloadFailedToHistoryRecord,
  type ReadarrHistoryRecord,
} from '@/server/readarr/history-mapper';
import { ReadarrPaginationQuery } from '@/server/readarr/schemas';

export const dynamic = 'force-dynamic';

const HISTORY_CAP = 1000;

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const parsed = ReadarrPaginationQuery.safeParse(Object.fromEntries(url.searchParams));
  const { page, pageSize } = parsed.success ? parsed.data : { page: 1, pageSize: 50 };
  const offset = (page - 1) * pageSize;

  const [grabbed, imported, failed] = await Promise.all([
    listGrabbedForHistory(HISTORY_CAP),
    listImportedForHistory(HISTORY_CAP),
    listFailedForHistory(HISTORY_CAP),
  ]);

  const events: ReadarrHistoryRecord[] = [
    ...grabbed.map(downloadGrabbedToHistoryRecord),
    ...imported.map(libraryFileImportedToHistoryRecord),
    ...failed.map(downloadFailedToHistoryRecord),
  ];
  events.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const totalRecords = events.length;
  const records = events.slice(offset, offset + pageSize);

  return NextResponse.json({
    records,
    page,
    pageSize,
    totalRecords,
    sortKey: 'date',
    sortDirection: 'descending',
  });
}
