import { NextResponse } from 'next/server';
import { requireAdmin } from '@/server/auth/require-admin';
import { oidcConfigSetting } from '@/server/db/settings/oidc';
import { forwardAuthConfigSetting } from '@/server/db/settings/forward-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/mobile/auth/config — the sign-in methods summary for the mobile
 * Settings → Authentication screen.
 *
 * The web auth page reads the OIDC + forward-auth settings server-side and
 * renders editable forms; the mobile screen only shows a read-only summary
 * (config edits happen on desktop). This endpoint returns the exact
 * `{ modes: [{ kind, enabled, summary }] }` shape the mobile `AuthConfigResponse`
 * schema expects. Gated by `requireAdmin`, which accepts both the web session
 * cookie and the mobile bearer token.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) {
    return NextResponse.json({ message: ctx.message }, { status: ctx.status });
  }

  const oidc = await oidcConfigSetting.get();
  const fwd = await forwardAuthConfigSetting.get();

  const modes = [
    {
      kind: 'local' as const,
      enabled: true,
      summary: 'Username + password · always available',
    },
    {
      kind: 'oidc' as const,
      enabled: oidc.enabled,
      summary: oidc.enabled
        ? oidc.issuer.length > 0
          ? oidc.issuer
          : 'Configured'
        : 'Not configured',
    },
    {
      kind: 'forward_auth' as const,
      enabled: fwd.enabled,
      summary: fwd.enabled
        ? `Header ${fwd.userHeader} · ${fwd.trustedProxies.length} trusted ${
            fwd.trustedProxies.length === 1 ? 'proxy' : 'proxies'
          }`
        : 'Not configured',
    },
  ];

  return NextResponse.json({ modes });
}
