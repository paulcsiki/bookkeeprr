import { NextResponse } from 'next/server';
import { LoginBody as Body } from '@/server/openapi/schemas/auth';
import { getUserByUsername, updateUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { verifyPassword } from '@/server/auth/password';
import { logLoginSuccess, logLoginFailure } from '@/server/auth/events';
import { setSessionCookie } from '@/server/auth/session-cookie';
import { createExchangeCode } from '@/server/mobile/exchange-codes';
import { validateReturnTo, appendExchangeCode } from '@/server/mobile/return-to';
import { signChallengeToken } from '@/server/auth/totp-challenge';

export const dynamic = 'force-dynamic';

/**
 * Content negotiation for the mobile onboarding flow:
 *
 * `expo-web-browser.openAuthSessionAsync` listens for browser navigation
 * events, so the cleanest signal that "auth is complete, dispatch the
 * deep link" is a real HTTP 302 to `bookkeeprr://...`. That works for a
 * traditional `<form method="post">` no-JS submit: the browser follows
 * the redirect natively.
 *
 * A `fetch()`-based caller (our own <LoginForm>) cannot follow a 302 to
 * a non-http scheme — browsers reject the cross-scheme redirect. So
 * fetch callers ask for JSON (either via Content-Type: application/json
 * on the request, or Accept: application/json) and the route returns
 * `{ redirect_to: 'bookkeeprr://...?exchange=...' }`. The fetch caller
 * then navigates manually via `window.location.href`.
 *
 * Detection: a request is treated as JSON-preferring iff its
 * Content-Type or Accept header mentions `application/json`. Everything
 * else — i.e. the default browser-form Accept: text/html — gets the 302.
 */
function prefersJsonResponse(req: Request): boolean {
  const ct = (req.headers.get('content-type') ?? '').toLowerCase();
  if (ct.includes('application/json')) return true;
  const accept = (req.headers.get('accept') ?? '').toLowerCase();
  if (accept.includes('application/json')) return true;
  return false;
}

async function readBody(req: Request): Promise<{ ok: true; raw: unknown } | { ok: false }> {
  const ct = (req.headers.get('content-type') ?? '').toLowerCase();
  // A traditional <form> POST submits application/x-www-form-urlencoded (or
  // multipart/form-data). Accept those so the no-JS 302 branch is reachable
  // from a real HTML form without forcing JS to JSON-encode the payload.
  if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
    try {
      const fd = await req.formData();
      const obj: Record<string, string> = {};
      for (const [k, v] of fd.entries()) {
        if (typeof v === 'string') obj[k] = v;
      }
      return { ok: true, raw: obj };
    } catch {
      return { ok: false };
    }
  }
  try {
    return { ok: true, raw: await req.json() };
  } catch {
    return { ok: false };
  }
}

export async function POST(req: Request): Promise<Response> {
  const preferJson = prefersJsonResponse(req);
  const bodyResult = await readBody(req);
  if (!bodyResult.ok) {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = Body.safeParse(bodyResult.raw);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid request body' }, { status: 400 });
  }

  // Mobile onboarding: `return_to` MUST start with `bookkeeprr://`. Any
  // other scheme is rejected up-front so the server never authenticates a
  // user for a payload it can't safely redirect to.
  let validatedReturnTo: string | null = null;
  if (parsed.data.return_to !== undefined) {
    validatedReturnTo = validateReturnTo(parsed.data.return_to);
    if (validatedReturnTo === null) {
      return NextResponse.json({ error: 'invalid return_to scheme' }, { status: 400 });
    }
  }

  const ip = req.headers.get('x-forwarded-for') ?? null;
  const ua = req.headers.get('user-agent');

  const user = await getUserByUsername(parsed.data.username);
  if (user === null) {
    logLoginFailure({ username: parsed.data.username, ipAddress: ip, reason: 'user_not_found' });
    return NextResponse.json({ message: 'Invalid username or password' }, { status: 401 });
  }
  if (user.disabled) {
    logLoginFailure({ username: parsed.data.username, ipAddress: ip, reason: 'disabled' });
    return NextResponse.json({ message: 'Account disabled' }, { status: 401 });
  }
  // OIDC-only account — no local password to verify. The DB invariant ties
  // authSource==='oidc' to passwordHash===null; we test both so TypeScript can
  // narrow passwordHash to a non-null string below.
  if (user.authSource === 'oidc' || user.passwordHash === null) {
    logLoginFailure({ username: parsed.data.username, ipAddress: ip, reason: 'bad_password' });
    return NextResponse.json({ message: 'Invalid username or password' }, { status: 401 });
  }
  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) {
    logLoginFailure({ username: parsed.data.username, ipAddress: ip, reason: 'bad_password' });
    return NextResponse.json({ message: 'Invalid username or password' }, { status: 401 });
  }

  // TOTP challenge: if the user has 2FA enabled, don't issue a session yet.
  // Return a short-lived challenge token instead.
  if (user.totpEnabledAt !== null) {
    const challengeToken = await signChallengeToken(user.id);
    return NextResponse.json({ requiresTotp: true, challengeToken });
  }

  const session = await createSession({
    userId: user.id,
    userAgent: ua,
    ipAddress: ip,
  });
  await updateUser(user.id, { lastLoginAt: new Date() });
  logLoginSuccess({ userId: user.id, username: user.username, ipAddress: ip, userAgent: ua });

  let redirectTo: string | null = null;
  if (validatedReturnTo !== null) {
    const code = await createExchangeCode(user.id);
    redirectTo = appendExchangeCode(validatedReturnTo, code);
  }

  // No-JS form POST with a valid bookkeeprr:// return_to: emit a real 302
  // so the in-app browser sees a navigation event and dispatches the deep
  // link without any client JS needing to run. Fetch callers (JSON-prefer)
  // fall through to the JSON branch below.
  if (!preferJson && redirectTo !== null) {
    const res = new NextResponse(null, {
      status: 302,
      headers: { Location: redirectTo },
    });
    setSessionCookie(res, session.token, req);
    return res;
  }

  const res = NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    },
    ...(redirectTo !== null ? { redirect_to: redirectTo } : {}),
  });
  setSessionCookie(res, session.token, req);
  return res;
}
