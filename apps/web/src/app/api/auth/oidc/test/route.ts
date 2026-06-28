import { NextResponse } from 'next/server';
import { OidcTestBody as Body } from '@/server/openapi/schemas/auth';
import { allowInsecureRequests } from 'openid-client';
import * as oidc from '@/server/auth/oidc/openid-client';
import { requireAdmin } from '@/server/auth/require-admin';
import { oidcConfigSetting } from '@/server/db/settings/oidc';

export const dynamic = 'force-dynamic';

// The config GET route masks the stored client secret to this sentinel; the form
// echoes it back on a Test when the user didn't re-type the secret. Treat a blank
// or masked secret as "use the stored one".
const MASK = '••••••••';

export async function POST(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) return NextResponse.json({ message: ctx.message }, { status: ctx.status });
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

  const submitted = parsed.data.clientSecret ?? '';
  const clientSecret =
    submitted.length > 0 && submitted !== MASK
      ? submitted
      : (await oidcConfigSetting.get()).clientSecret;
  if (clientSecret.length === 0) {
    return NextResponse.json({ message: 'Client secret required' }, { status: 400 });
  }

  try {
    const opts =
      process.env.BOOKKEEPRR_OIDC_ALLOW_INSECURE === '1'
        ? { execute: [allowInsecureRequests] }
        : undefined;
    const config = await oidc.discovery(
      new URL(parsed.data.issuer),
      parsed.data.clientId,
      clientSecret,
      undefined,
      opts,
    );
    const md = config.serverMetadata();
    return NextResponse.json({
      ok: true,
      issuer: md.issuer,
      authorizationEndpoint: md.authorization_endpoint ?? null,
      tokenEndpoint: md.token_endpoint ?? null,
      jwksUri: md.jwks_uri ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: 'discovery_failed', detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
