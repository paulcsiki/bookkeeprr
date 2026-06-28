import { NextResponse } from 'next/server';
import { listActiveDownloadsForQueue } from '@/server/db/downloads';
import { downloadRowToQueueRecord } from '@/server/readarr/queue-mapper';
import { ReadarrPaginationQuery } from '@/server/readarr/schemas';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const parsed = ReadarrPaginationQuery.safeParse(Object.fromEntries(url.searchParams));
  const { page, pageSize } = parsed.success ? parsed.data : { page: 1, pageSize: 50 };
  const offset = (page - 1) * pageSize;
  const { rows, total } = await listActiveDownloadsForQueue(pageSize, offset);
  return NextResponse.json({
    records: rows.map(downloadRowToQueueRecord),
    page,
    pageSize,
    totalRecords: total,
    sortKey: 'timeleft',
    sortDirection: 'ascending',
  });
}
