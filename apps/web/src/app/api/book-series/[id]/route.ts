import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/server/auth/require-admin';
import { recordAuditEvent } from '@/server/audit/record';
import { auditContext } from '@/server/audit/request';
import { getBookSeries, updateBookSeries, deleteBookSeries } from '@/server/db/book-series';
import { mergeBooks } from '@/server/db/book-series-view';
import { UpdateBookSeriesBody } from '@/server/openapi/schemas/book-series';

export const dynamic = 'force-dynamic';

/**
 * GET /api/book-series/{id} — book series detail with merged books list.
 *
 * The `books` array merges owned library members with unmatched saga entries:
 * entries matched by externalRef (isbn/asin) or title+position become owned;
 * members with no matching entry are appended as owned orphans. Sorted by
 * position (nulls last).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const detail = await getBookSeries(id);
  if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const books = mergeBooks(detail);

  const { bookSeries, members } = detail;
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

/**
 * PATCH /api/book-series/{id} — admin-only rename/update.
 *
 * Accepts any combination of `name`, `description`, `coverUrl`. 401/403
 * use the `{ message }` envelope.
 */
export async function PATCH(
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

  let body: z.infer<typeof UpdateBookSeriesBody>;
  try {
    body = UpdateBookSeriesBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof z.ZodError ? e.message : 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const before = await getBookSeries(id);
  if (!before) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await updateBookSeries(id, body);

  await recordAuditEvent({
    actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
    action: 'book_series.update',
    target: { kind: 'book_series', id: String(id) },
    metadata: body,
    context: auditContext(req),
  });

  const updated = await getBookSeries(id);
  const bs = updated!.bookSeries;
  return NextResponse.json({
    id: bs.id,
    name: bs.name,
    contentType: bs.contentType,
    coverUrl: bs.coverUrl,
    totalBooks: bs.totalBooks,
    memberCount: updated!.members.length,
    source: bs.source,
  });
}

/**
 * DELETE /api/book-series/{id} — admin-only delete.
 *
 * Removes the book series, its member links, and its saga entries. Member
 * library series themselves are NOT deleted. 401/403 use the `{ message }`
 * envelope.
 */
export async function DELETE(
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

  const existing = await getBookSeries(id);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await deleteBookSeries(id);

  await recordAuditEvent({
    actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
    action: 'book_series.delete',
    target: { kind: 'book_series', id: String(id) },
    metadata: {},
    context: auditContext(req),
  });

  return NextResponse.json({ ok: true });
}
