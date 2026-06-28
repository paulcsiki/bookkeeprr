import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/server/auth/session-middleware';
import { revokeApiKey } from '@/server/db/api-keys';
import { recordAuditEvent } from '@/server/audit/record';
import { auditActor, auditContext } from '@/server/audit/request';

export const dynamic = 'force-dynamic';

async function resolveUserId(
  req: Request,
): Promise<{ userId: number } | NextResponse> {
  const result = await authenticateRequest(req as Parameters<typeof authenticateRequest>[0]);
  if (result.kind !== 'authenticated' || result.actor === 'system') {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  return { userId: result.actor.userId };
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await resolveUserId(req);
  if (auth instanceof NextResponse) return auth;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    return NextResponse.json({ message: 'Invalid id' }, { status: 400 });
  }

  const result = await revokeApiKey(auth.userId, id);
  if (!result.ok) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  await recordAuditEvent({
    actor: await auditActor(req),
    action: 'apikey.revoke',
    target: { kind: 'apikey', id: String(id) },
    context: auditContext(req),
  });

  return NextResponse.json({ ok: true });
}
