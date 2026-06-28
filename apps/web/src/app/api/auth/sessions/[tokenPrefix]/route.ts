import { NextResponse } from 'next/server';
import { getSessionByToken, revokeSessionByPrefix } from '@/server/db/sessions';
import { getUser } from '@/server/db/users';
import { readSessionCookie } from '@/server/auth/session-cookie';
import { recordAuditEvent } from '@/server/audit/record';
import { auditContext } from '@/server/audit/request';

export const dynamic = 'force-dynamic';

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ tokenPrefix: string }> },
): Promise<NextResponse> {
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

  const { tokenPrefix } = await params;

  // Reject if the prefix matches the current session token (use logout instead).
  if (token.startsWith(tokenPrefix)) {
    return NextResponse.json(
      { message: 'Cannot revoke the current session — use logout instead' },
      { status: 400 },
    );
  }

  const result = await revokeSessionByPrefix(user.id, tokenPrefix);
  if ('error' in result) {
    if (result.error === 'not_found') {
      return NextResponse.json({ message: 'Session not found' }, { status: 404 });
    }
    if (result.error === 'ambiguous') {
      return NextResponse.json({ message: 'Ambiguous prefix — provide more characters' }, { status: 409 });
    }
  }

  await recordAuditEvent({
    actor: { kind: 'user', userId: user.id, username: user.username },
    action: 'session.revoke',
    target: { kind: 'session', id: tokenPrefix },
    context: auditContext(req),
  });

  return NextResponse.json({ ok: true });
}
