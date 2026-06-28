import { getSessionByToken } from '@/server/db/sessions';
import { getUser } from '@/server/db/users';
import { readSessionCookie } from '@/server/auth/session-cookie';
import { authenticateBearer } from '@/server/mobile/bearer-middleware';
import type { UserRow } from '@/server/db/schema';

export type AdminContext = { user: UserRow };

/**
 * Gate an admin-only route. Accepts the web session cookie AND the mobile bearer
 * token — the cookie-only version always 401'd mobile admins, and the mobile
 * client turned that into a sign-out. 401 = not a logged-in human; 403 =
 * authenticated but not an admin (the client must NOT sign out on a 403).
 */
export async function requireAdmin(
  req: Request,
): Promise<AdminContext | { status: number; message: string }> {
  const token = readSessionCookie(req);
  if (token === null) {
    // No session cookie — fall back to the mobile bearer token (header-only,
    // so it's safe on any Request).
    const bearer = await authenticateBearer(req);
    if (bearer.kind === 'authenticated') {
      if (bearer.user.role !== 'admin') return { status: 403, message: 'Forbidden' };
      return { user: bearer.user };
    }
    return { status: 401, message: 'Unauthorized' };
  }
  const session = await getSessionByToken(token);
  if (session === null || session.expiresAt <= new Date()) {
    return { status: 401, message: 'Unauthorized' };
  }
  const user = await getUser(session.userId);
  if (user === null || user.disabled) {
    return { status: 401, message: 'Unauthorized' };
  }
  if (user.role !== 'admin') {
    return { status: 403, message: 'Forbidden' };
  }
  return { user };
}
