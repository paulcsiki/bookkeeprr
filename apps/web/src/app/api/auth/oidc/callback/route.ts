import { NextResponse } from 'next/server';
import * as oidc from '@/server/auth/oidc/openid-client';
import { loadOidcConfig, loadDiscoveredConfig } from '@/server/auth/oidc/client';
import {
  parseOidcPendingCookie,
  buildOidcPendingClearCookie,
} from '@/server/auth/oidc/state-cookie';
import {
  findUserByOidcSubject,
  getUserByUsername,
  insertOidcUser,
  updateUser,
  countActiveAdmins,
} from '@/server/db/users';
import { provisionExternalUser, type ExternalAuthClaims } from '@/server/auth/external-provision';
import { createSession } from '@/server/db/sessions';
import * as events from '@/server/auth/events';
import type { OidcLoginFailureReason } from '@/server/auth/events';
import { buildSessionCookieHeader } from '@/server/auth/session-cookie-builder';
import { logger } from '@/server/logger';
import { createExchangeCode } from '@/server/mobile/exchange-codes';
import { validateReturnTo, appendExchangeCode } from '@/server/mobile/return-to';

export const dynamic = 'force-dynamic';

function getClientIp(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd !== null && fwd.length > 0) return fwd.split(',', 1)[0]!.trim();
  return null;
}

function readPendingCookie(req: Request): string | null {
  const raw = req.headers.get('cookie') ?? '';
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === 'bookkeeprr_oidc_pending') return rest.join('=');
  }
  return null;
}

function safeNext(next: string | null | undefined): string {
  if (next === null || next === undefined) return '/';
  // Open-redirect guard: must start with '/' but not '//'.
  if (!next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}

function errorPage(title: string, message: string, status: number): NextResponse {
  const html = `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font-family:sans-serif;padding:2rem;max-width:32rem"><h1>${title}</h1><p>${message}</p><p><a href="/login">Back to login</a></p></body>`;
  return new NextResponse(html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'set-cookie': buildOidcPendingClearCookie(),
    },
  });
}

function logFail(reason: OidcLoginFailureReason, ip: string | null): void {
  events.logOidcLoginFailure({ reason, ipAddress: ip });
}

export async function GET(req: Request): Promise<NextResponse> {
  const ip = getClientIp(req);
  const ua = req.headers.get('user-agent');

  const pendingRaw = readPendingCookie(req);
  if (pendingRaw === null) {
    logFail('state_mismatch', ip);
    return errorPage('Sign-in failed', 'Missing or expired session.', 400);
  }
  const pending = await parseOidcPendingCookie(pendingRaw);
  if (pending === null) {
    logFail('state_mismatch', ip);
    return errorPage('Sign-in failed', 'Invalid sign-in session.', 400);
  }

  const url = new URL(req.url);
  const stateParam = url.searchParams.get('state');
  if (stateParam !== pending.state) {
    logFail('state_mismatch', ip);
    return errorPage('Sign-in failed', 'State mismatch.', 400);
  }

  const cfg = await loadOidcConfig();
  if (cfg === null) {
    return errorPage('Sign-in failed', 'OIDC is no longer configured.', 400);
  }

  let config;
  try {
    config = await loadDiscoveredConfig(cfg);
  } catch {
    logFail('discovery_failed', ip);
    return errorPage('Sign-in failed', 'OIDC provider could not be reached.', 502);
  }

  let tokens;
  try {
    tokens = await oidc.authorizationCodeGrant(config, url, {
      pkceCodeVerifier: pending.codeVerifier,
      expectedState: pending.state,
      expectedNonce: pending.nonce,
      idTokenExpected: true,
    });
  } catch (err) {
    const errObj = err instanceof Error ? err : null;
    const causeObj =
      errObj !== null && 'cause' in errObj && errObj.cause instanceof Error ? errObj.cause : null;
    logger()
      .child({ component: 'auth' })
      .warn(
        {
          err: errObj?.message ?? String(err),
          cause: causeObj?.message ?? null,
          causeStack: causeObj?.stack ?? null,
        },
        'oidc.authorizationCodeGrant failed',
      );
    logFail('token_invalid', ip);
    return errorPage('Sign-in failed', 'Identity token rejected.', 401);
  }

  const raw = tokens.claims();
  if (raw === undefined || raw === null) {
    logFail('token_invalid', ip);
    return errorPage('Sign-in failed', 'Identity token missing claims.', 401);
  }
  const rawObj = raw as Record<string, unknown>;
  const sub = typeof rawObj.sub === 'string' ? rawObj.sub : null;
  const iss = typeof rawObj.iss === 'string' ? rawObj.iss : null;
  if (sub === null || iss === null) {
    logFail('token_invalid', ip);
    return errorPage('Sign-in failed', 'Identity token missing sub/iss.', 401);
  }
  const usernameClaim = rawObj[cfg.usernameClaim];
  const emailClaim = rawObj[cfg.emailClaim];
  const groupsClaim = rawObj[cfg.groupsClaim];
  const preferredUsername =
    typeof usernameClaim === 'string' && usernameClaim.length > 0 ? usernameClaim : null;
  const email = typeof emailClaim === 'string' && emailClaim.length > 0 ? emailClaim : null;
  const groups = Array.isArray(groupsClaim)
    ? groupsClaim.filter((g): g is string => typeof g === 'string')
    : [];
  // Username derivation lives in the OIDC callback (was in M21's provision(); now caller-side).
  const derivedUsername = preferredUsername ?? email?.split('@', 1)[0] ?? `oidc-${sub.slice(0, 8)}`;
  const claims: ExternalAuthClaims = {
    source: 'oidc',
    username: derivedUsername,
    email,
    groups,
    oidcIssuer: iss,
    oidcSubject: sub,
  };

  const existingUser = await findUserByOidcSubject(iss, sub);
  const sameUsername = await getUserByUsername(claims.username);
  const usernameCollision =
    sameUsername !== null && (existingUser === null || sameUsername.id !== existingUser.id)
      ? sameUsername
      : null;
  const activeAdminCount = await countActiveAdmins();

  const result = provisionExternalUser(claims, {
    policy: {
      allowedGroups: cfg.allowedGroups,
      adminGroups: cfg.adminGroups,
      autoCreateUsers: cfg.autoCreateUsers,
    },
    existingUser,
    usernameCollision,
    activeAdminCount,
  });

  if (result.kind === 'denied') {
    logFail(result.reason, ip);
    if (result.reason === 'username_conflict') {
      return errorPage(
        'Sign-in failed',
        'A local account already uses this username. Contact an administrator.',
        409,
      );
    }
    return errorPage('Not authorized', "Your IdP account isn't authorized for bookkeeprr.", 403);
  }

  let userId: number;
  let username: string;
  if (result.kind === 'create') {
    // result.insert.authSource is 'oidc' here. oidcIssuer/Subject are non-null because we set them in the claims.
    const created = await insertOidcUser({
      username: result.insert.username,
      role: result.insert.role,
      oidcIssuer: result.insert.oidcIssuer!,
      oidcSubject: result.insert.oidcSubject!,
      email: result.insert.email,
    });
    userId = created.id;
    username = created.username;
  } else {
    userId = result.userId;
    const beforeRole = existingUser!.role;
    if (result.roleChanged) {
      await updateUser(userId, { role: result.newRole, lastLoginAt: new Date() });
      events.logOidcRoleRecompute({
        userId,
        oldRole: beforeRole,
        newRole: result.newRole,
        viaGroups:
          result.newRole === 'admin'
            ? cfg.adminGroups.filter((g) => claims.groups.includes(g))
            : [],
        guardFired: false,
      });
    } else if (
      beforeRole === 'admin' &&
      result.newRole === 'admin' &&
      !claims.groups.some((g) => cfg.adminGroups.includes(g))
    ) {
      // Guard held the line — emit a recompute event with guardFired=true so M23 can audit.
      events.logOidcRoleRecompute({
        userId,
        oldRole: beforeRole,
        newRole: result.newRole,
        viaGroups: [],
        guardFired: true,
      });
      await updateUser(userId, { lastLoginAt: new Date() });
    } else {
      await updateUser(userId, { lastLoginAt: new Date() });
    }
    username = existingUser!.username;
  }

  const session = await createSession({
    userId,
    userAgent: ua,
    ipAddress: ip,
  });

  events.logOidcLoginSuccess({
    userId,
    username,
    oidcSubject: sub,
    oidcIssuer: iss,
    ipAddress: ip,
    userAgent: ua,
  });

  // Mobile onboarding: if the OIDC start carried a (validated)
  // `return_to=bookkeeprr://…`, re-validate it here (defense in depth
  // against a tampered cookie payload) and redirect there with a fresh
  // single-use exchange code attached.
  let location = safeNext(pending.next);
  const candidateReturnTo =
    pending.returnTo !== null && pending.returnTo !== undefined ? pending.returnTo : null;
  const validatedReturnTo = candidateReturnTo !== null ? validateReturnTo(candidateReturnTo) : null;
  if (validatedReturnTo !== null) {
    const code = await createExchangeCode(userId);
    location = appendExchangeCode(validatedReturnTo, code);
  }

  return new NextResponse(null, {
    status: 302,
    headers: [
      ['location', location],
      ['set-cookie', buildSessionCookieHeader(session.token)],
      ['set-cookie', buildOidcPendingClearCookie()],
    ],
  });
}
