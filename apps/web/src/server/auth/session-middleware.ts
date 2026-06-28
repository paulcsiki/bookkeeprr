import type { NextRequest } from 'next/server';
import { validateApiKey } from '@/server/readarr/auth';
import {
  getSessionByToken,
  refreshSession,
  createSession,
  revokeSession,
} from '@/server/db/sessions';
import { getUser } from '@/server/db/users';
import { tryForwardAuth } from '@/server/auth/forward-auth/middleware';
import { extractProxyIp, extractClientIp } from '@/server/auth/forward-auth/peer';
import { logForwardAuthLoginFailure } from '@/server/auth/events';
import { authenticateBearer, hasBearerHeader } from '@/server/mobile/bearer-middleware';
import { findUserByBearer, markApiKeyUsed } from '@/server/db/api-keys';

const PERSONAL_KEY_PREFIX = 'Bearer bkr_';

export type AuthActor = 'system' | { userId: number; role: 'admin' | 'user' };

export type AuthResult =
  | { kind: 'authenticated'; actor: AuthActor; sessionTokenToSet?: string }
  | { kind: 'unauthenticated' };

export async function authenticateRequest(req: NextRequest): Promise<AuthResult> {
  // 1. X-Api-Key (M18) → 'system'.
  const apiKeyResult = await validateApiKey(req);
  if (apiKeyResult === 'ok-key-set') {
    return { kind: 'authenticated', actor: 'system' };
  }

  // 2. Forward-auth (M22).
  const fwd = await tryForwardAuth(req);
  if (fwd.kind === 'authenticated') {
    const sessionTokenToSet = await ensureForwardAuthSession(req, fwd.userId);
    return {
      kind: 'authenticated',
      actor: { userId: fwd.userId, role: fwd.role },
      sessionTokenToSet,
    };
  }
  if (fwd.kind === 'failure') {
    logForwardAuthLoginFailure({
      reason: fwd.reason,
      peerIp: extractProxyIp(req),
      clientIp: extractClientIp(req),
    });
    return { kind: 'unauthenticated' };
  }
  // fwd.kind === 'not_applicable' → fall through.

  // 3b. Personal API key bearer token (DS11b-2). Checked before mobile
  // tokens because personal API keys carry a distinct `bkr_` prefix.
  const authHeader = req.headers.get('authorization') ?? '';
  if (
    authHeader.toLowerCase().startsWith(PERSONAL_KEY_PREFIX.toLowerCase()) &&
    (req.cookies.get('bookkeeprr_session')?.value ?? '') === ''
  ) {
    const bearer = authHeader.slice('Bearer '.length).trim();
    const found = await findUserByBearer(bearer);
    if (found !== null) {
      const user = await getUser(found.userId);
      if (user !== null && !user.disabled) {
        void markApiKeyUsed(found.keyId);
        return {
          kind: 'authenticated',
          actor: { userId: user.id, role: user.role },
        };
      }
    }
    // Unknown / invalid personal API key — fall through to other auth.
  }

  // 3. Mobile bearer token (M34). Only attempted when the request carries
  // an `Authorization: Bearer …` header AND no api-key / forward-auth /
  // session-cookie auth was provided — keeps cookie-bearing browser
  // requests on the cookie path even if a stale Authorization header is
  // present.
  if (hasBearerHeader(req) && (req.cookies.get('bookkeeprr_session')?.value ?? '') === '') {
    const bearer = await authenticateBearer(req);
    if (bearer.kind === 'authenticated') {
      return {
        kind: 'authenticated',
        actor: { userId: bearer.user.id, role: bearer.user.role },
      };
    }
    // invalid_token → fall through to session-cookie (which will fail) and
    // ultimately return 'unauthenticated'. This keeps the failure mode
    // identical to today's "bad cookie" behaviour.
  }

  // 4. Session cookie (M20/M21).
  const token = req.cookies.get('bookkeeprr_session')?.value;
  if (token !== undefined && token.length > 0) {
    const session = await getSessionByToken(token);
    if (session !== null && session.expiresAt > new Date()) {
      const user = await getUser(session.userId);
      if (user !== null && !user.disabled) {
        await refreshSession(token);
        return {
          kind: 'authenticated',
          actor: { userId: user.id, role: user.role },
        };
      }
    }
  }

  return { kind: 'unauthenticated' };
}

async function ensureForwardAuthSession(
  req: NextRequest,
  userId: number,
): Promise<string | undefined> {
  const cookieToken = req.cookies.get('bookkeeprr_session')?.value;
  if (cookieToken !== undefined && cookieToken.length > 0) {
    const session = await getSessionByToken(cookieToken);
    if (session !== null && session.userId === userId && session.expiresAt > new Date()) {
      await refreshSession(cookieToken);
      return undefined;
    }
    if (session !== null) {
      await revokeSession(cookieToken);
    }
  }
  const newSession = await createSession({
    userId,
    userAgent: req.headers.get('user-agent'),
    ipAddress: extractClientIp(req),
  });
  return newSession.token;
}
