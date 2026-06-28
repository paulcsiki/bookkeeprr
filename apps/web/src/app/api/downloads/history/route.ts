import { NextResponse } from 'next/server';
import { inArray } from 'drizzle-orm';
import { requireAdmin } from '@/server/auth/require-admin';
import { getDb } from '@/server/db/client';
import { downloads } from '@/server/db/schema';
import { withWriteLock } from '@/server/db/write-lock';
import { recordAuditEvent } from '@/server/audit/record';
import { auditContext } from '@/server/audit/request';

export const dynamic = 'force-dynamic';

const TERMINAL_STATUSES = ['completed', 'imported', 'failed'] as const;

export async function DELETE(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) {
    return NextResponse.json({ message: ctx.message }, { status: ctx.status });
  }

  const deleted = await withWriteLock(async () => {
    const result = await getDb()
      .delete(downloads)
      .where(inArray(downloads.status, [...TERMINAL_STATUSES]))
      .returning({ id: downloads.id });
    return result.length;
  });

  await recordAuditEvent({
    actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
    action: 'download.history_clear',
    metadata: { deleted },
    context: auditContext(req),
  });

  return NextResponse.json({ ok: true, deleted });
}
