import { NextResponse } from 'next/server';
import { requireAdmin } from '@/server/auth/require-admin';
import { recordAuditEvent } from '@/server/audit/record';
import { auditContext } from '@/server/audit/request';
import { removeMember } from '@/server/db/book-series';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/book-series/{id}/members/{seriesId} — admin-only unassign a
 * library series from this book series.
 *
 * Idempotent: deleting a series that is not a member is a no-op (returns 200).
 * 401/403 use the `{ message }` envelope.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; seriesId: string }> },
): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) return NextResponse.json({ message: ctx.message }, { status: ctx.status });

  const { id: idStr, seriesId: seriesIdStr } = await params;
  const id = parseInt(idStr, 10);
  const seriesId = parseInt(seriesIdStr, 10);
  if (Number.isNaN(id) || Number.isNaN(seriesId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  await removeMember(id, seriesId);

  await recordAuditEvent({
    actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
    action: 'book_series.member_remove',
    target: { kind: 'book_series', id: String(id) },
    metadata: { seriesId },
    context: auditContext(req),
  });

  return NextResponse.json({ ok: true });
}
