import { NextResponse } from 'next/server';
import { getSessionByToken, revokeSession } from '@/server/db/sessions';
import { getUser } from '@/server/db/users';
import { clearSessionCookie, readSessionCookie } from '@/server/auth/session-cookie';
import { logLogout } from '@/server/auth/events';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  const token = readSessionCookie(req);
  if (token !== null) {
    const session = await getSessionByToken(token);
    if (session !== null) {
      const user = await getUser(session.userId);
      await revokeSession(token);
      logLogout({
        userId: session.userId,
        username: user?.username ?? '',
        sessionToken: token,
      });
    }
  }
  const res = new NextResponse(null, { status: 204 });
  clearSessionCookie(res);
  return res;
}
