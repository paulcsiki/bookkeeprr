import { NextResponse } from 'next/server';
import { dirname } from 'node:path';
import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { scanMatches } from '@/server/db/schema';
import { dirHash } from '@/lib/dir-hash';
import { withWriteLock } from '@/server/db/write-lock';
import { recordAuditEvent } from '@/server/audit/record';
import { auditActor, auditContext } from '@/server/audit/request';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ dirHash: string }> };

export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { dirHash: targetHash } = await ctx.params;
  const pending = await getDb().select().from(scanMatches).where(eq(scanMatches.status, 'pending'));
  const groupRows = pending.filter((r) => dirHash(dirname(r.filePath)) === targetHash);
  if (groupRows.length === 0) {
    return NextResponse.json({ error: 'group not found' }, { status: 404 });
  }
  await withWriteLock(() =>
    getDb().transaction((tx) => {
      for (const r of groupRows) {
        tx.update(scanMatches)
          .set({ status: 'rejected', reviewedAt: new Date() })
          .where(eq(scanMatches.id, r.id))
          .run();
      }
    }),
  );
  const actor = await auditActor(req);
  await recordAuditEvent({
    actor,
    action: 'scan.group_reject',
    target: { kind: 'scan_group', id: targetHash },
    metadata: { rejectedCount: groupRows.length },
    context: auditContext(req),
  });
  return NextResponse.json({ rejectedCount: groupRows.length }, { status: 200 });
}
