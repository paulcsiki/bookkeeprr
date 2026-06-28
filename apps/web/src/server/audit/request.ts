import { getSessionByToken } from '@/server/db/sessions';
import { getUser } from '@/server/db/users';
import { readSessionCookie } from '@/server/auth/session-cookie';
import { extractProxyIp, extractClientIp } from '@/server/auth/forward-auth/peer';
import type { AuditActor, AuditRequestContext } from '@/server/audit/record';

/** Request IP/user-agent context for an audit event. */
export function auditContext(req: Request): AuditRequestContext {
  return {
    peerIp: extractProxyIp(req),
    clientIp: extractClientIp(req),
    userAgent: req.headers.get('user-agent'),
  };
}

/**
 * Resolves the audit actor for a request from its session cookie. Returns the
 * signed-in user when present, otherwise `anonymous`. Use this for mutating
 * routes that aren't admin-gated (admin routes already have `ctx.user` from
 * `requireAdmin` and can build the actor from that directly).
 */
export async function auditActor(req: Request): Promise<AuditActor> {
  const token = readSessionCookie(req);
  if (token === null) return { kind: 'anonymous' };
  const session = await getSessionByToken(token);
  if (session === null || session.expiresAt <= new Date()) return { kind: 'anonymous' };
  const user = await getUser(session.userId);
  if (user === null) return { kind: 'anonymous' };
  return { kind: 'user', userId: user.id, username: user.username };
}
