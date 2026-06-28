import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/server/auth/require-admin';
import { recordAuditEvent } from '@/server/audit/record';
import { auditContext } from '@/server/audit/request';
import { addMember, getBookSeries } from '@/server/db/book-series';
import { mergeBooks } from '@/server/db/book-series-view';
import { AddMemberBody } from '@/server/openapi/schemas/book-series';

export const dynamic = 'force-dynamic';

/**
 * POST /api/book-series/{id}/members — admin-only assign a library series to
 * this book series.
 *
 * Idempotent upsert: re-assigning a series that is already a member updates
 * its position and preserves the `manual` linkSource. Never returns 409.
 * Returns the refreshed detail on success.
 *
 * 422 when the series does not exist, or its content type doesn't match the
 * book series. 401/403 use the `{ message }` envelope.
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

  let body: z.infer<typeof AddMemberBody>;
  try {
    body = AddMemberBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof z.ZodError ? e.message : 'Invalid JSON body' },
      { status: 400 },
    );
  }

  try {
    await addMember(id, body.seriesId, { position: body.position ?? null, linkSource: 'manual' });
  } catch (e) {
    if (e instanceof Error) {
      if (/content type mismatch|does not exist/.test(e.message)) {
        return NextResponse.json({ error: e.message }, { status: 422 });
      }
    }
    throw e;
  }

  await recordAuditEvent({
    actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
    action: 'book_series.member_add',
    target: { kind: 'book_series', id: String(id) },
    metadata: { seriesId: body.seriesId, position: body.position ?? null },
    context: auditContext(req),
  });

  // Return refreshed detail (same merge as GET /api/book-series/{id}).
  const detail = await getBookSeries(id);
  if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { bookSeries, members } = detail;
  const books = mergeBooks(detail);

  return NextResponse.json({
    id: bookSeries.id,
    name: bookSeries.name,
    contentType: bookSeries.contentType,
    coverUrl: bookSeries.coverUrl ?? members[0]?.series.coverUrl ?? null,
    totalBooks: bookSeries.totalBooks,
    memberCount: members.length,
    source: bookSeries.source,
    description: bookSeries.description,
    books,
  });
}
