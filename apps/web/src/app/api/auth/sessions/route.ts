import { NextResponse } from 'next/server';
import { getSessionByToken, listSessionsForUser } from '@/server/db/sessions';
import { getUser } from '@/server/db/users';
import { readSessionCookie } from '@/server/auth/session-cookie';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
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

  const rows = await listSessionsForUser(user.id);
  const result = rows.map((s) => ({
    id: s.token.slice(0, 12),
    createdAt: s.createdAt.toISOString(),
    lastSeenAt: s.lastSeenAt.toISOString(),
    userAgent: s.userAgent ?? null,
    ipAddress: s.ipAddress ?? null,
    current: s.token === token,
  }));

  return NextResponse.json({ sessions: result });
}
