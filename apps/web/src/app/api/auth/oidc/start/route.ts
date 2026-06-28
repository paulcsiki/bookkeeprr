import { NextResponse } from 'next/server';
import * as oidc from 'openid-client';
import * as oidcSeam from '@/server/auth/oidc/openid-client';
import { loadOidcConfig, loadDiscoveredConfig } from '@/server/auth/oidc/client';
import { signOidcPendingCookie, buildOidcPendingSetCookie } from '@/server/auth/oidc/state-cookie';
import { validateReturnTo } from '@/server/mobile/return-to';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  const cfg = await loadOidcConfig();
  if (cfg === null) {
    return NextResponse.json({ message: 'OIDC not configured' }, { status: 400 });
  }

  let config;
  try {
    config = await loadDiscoveredConfig(cfg);
  } catch (e) {
    return NextResponse.json(
      { message: 'OIDC discovery failed', detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();

  const url = new URL(req.url);
  // Build redirect_uri from the public host the request actually hit (Host
  // header / X-Forwarded-* if behind a proxy), not from req.url's URL —
  // Next.js standalone resolves req.url's host to the bind address
  // (e.g. 0.0.0.0:3000), which the user's browser can't reach.
  const forwardedHost = req.headers.get('x-forwarded-host');
  const forwardedProto = req.headers.get('x-forwarded-proto');
  const host = forwardedHost ?? req.headers.get('host') ?? url.host;
  const proto = forwardedProto ?? url.protocol.replace(':', '');
  const origin = `${proto}://${host}`;
  const redirectUri = `${origin}/api/auth/oidc/callback`;
  const nextParam = url.searchParams.get('next');
  const returnToParam = url.searchParams.get('return_to');
  let validatedReturnTo: string | null = null;
  if (returnToParam !== null) {
    validatedReturnTo = validateReturnTo(returnToParam);
    if (validatedReturnTo === null) {
      return NextResponse.json({ error: 'invalid return_to scheme' }, { status: 400 });
    }
  }

  const authorizationUrl = oidcSeam.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri,
    scope: cfg.scopes.join(' '),
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce,
    response_type: 'code',
  });

  const pending = await signOidcPendingCookie({
    codeVerifier,
    state,
    nonce,
    issuer: cfg.issuer,
    next: nextParam,
    returnTo: validatedReturnTo,
  });

  return new NextResponse(null, {
    status: 302,
    headers: {
      location: authorizationUrl.href,
      'set-cookie': buildOidcPendingSetCookie(pending),
    },
  });
}
