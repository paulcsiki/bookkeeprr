import { NextResponse } from 'next/server';
import { getSessionByToken, revokeAllSessionsForUser } from '@/server/db/sessions';
import { getUser } from '@/server/db/users';
import { clearSessionCookie, readSessionCookie } from '@/server/auth/session-cookie';
import { recordAuditEvent } from '@/server/audit/record';
import { auditContext } from '@/server/audit/request';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  const token = readSessionCookie(req);
  if (token === null) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const session = await getSessionByToken(token);
  if (session === null || session.expiresAt <= new Date()) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const user = await getUser(session.userId);
  if (user === null || user.disabled) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  await revokeAllSessionsForUser(user.id);

  await recordAuditEvent({
    actor: { kind: 'user', userId: user.id, username: user.username },
    action: 'session.revoke_all',
    target: { kind: 'user', id: String(user.id) },
    context: auditContext(req),
  });

  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}
