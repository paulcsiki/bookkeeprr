import { NextResponse } from 'next/server';
import { requireAdmin } from '@/server/auth/require-admin';
import { getBookSeries } from '@/server/db/book-series';
import { enqueueJob } from '@/server/db/jobs';

export const dynamic = 'force-dynamic';

/**
 * POST /api/book-series/{id}/refresh — admin-only trigger detection refresh.
 *
 * Loads the book series' members and enqueues a `book_series_detect` job for
 * each member so detection is re-run for every title in the series.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) return NextResponse.json({ message: ctx.message }, { status: ctx.status });

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const detail = await getBookSeries(id);
  if (!detail) {
    return NextResponse.json({ error: 'Book series not found' }, { status: 404 });
  }

  // Re-enqueue detection for every member so detection is refreshed for all titles.
  for (const { member } of detail.members) {
    await enqueueJob('book_series_detect', { seriesId: member.seriesId });
  }

  return NextResponse.json({ ok: true, enqueued: detail.members.length }, { status: 202 });
}
