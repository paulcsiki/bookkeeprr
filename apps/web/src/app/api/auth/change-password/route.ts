import { NextResponse } from 'next/server';
import { ChangePasswordBody as Body } from '@/server/openapi/schemas/auth';
import { getSessionByToken, revokeAllSessionsForUser, createSession } from '@/server/db/sessions';
import { getUser, updateUser } from '@/server/db/users';
import { hashPassword, verifyPassword, validatePasswordPolicy } from '@/server/auth/password';
import { logPasswordChange } from '@/server/auth/events';
import { readSessionCookie, setSessionCookie } from '@/server/auth/session-cookie';

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

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid request body' }, { status: 400 });
  }

  // OIDC-only accounts cannot change a local password. The DB invariant ties
  // authSource==='oidc' to passwordHash===null; we test both so TypeScript can
  // narrow passwordHash to a non-null string below.
  if (user.authSource === 'oidc' || user.passwordHash === null) {
    return NextResponse.json(
      { message: 'Password change not available for OIDC accounts' },
      { status: 400 },
    );
  }

  // Voluntary change requires current-password check; forced change skips it.
  if (!user.mustChangePassword) {
    if (parsed.data.currentPassword === undefined) {
      return NextResponse.json({ message: 'Current password required' }, { status: 400 });
    }
    const ok = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
    if (!ok) {
      return NextResponse.json({ message: 'Current password incorrect' }, { status: 400 });
    }
  }

  const policy = validatePasswordPolicy(parsed.data.newPassword);
  if (!policy.ok) {
    return NextResponse.json({ message: policy.reason }, { status: 400 });
  }

  const newHash = await hashPassword(parsed.data.newPassword);
  const wasForced = user.mustChangePassword;
  await updateUser(user.id, { passwordHash: newHash, mustChangePassword: false });

  // Revoke all of this user's sessions; create a fresh one for the current client.
  await revokeAllSessionsForUser(user.id);
  const newSession = await createSession({
    userId: user.id,
    userAgent: req.headers.get('user-agent'),
    ipAddress: req.headers.get('x-forwarded-for') ?? null,
  });

  logPasswordChange({
    userId: user.id,
    username: user.username,
    byUserId: user.id,
    byUsername: user.username,
    forced: wasForced,
  });

  const res = NextResponse.json({ ok: true });
  setSessionCookie(res, newSession.token, req);
  return res;
}
