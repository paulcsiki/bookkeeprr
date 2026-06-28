import { NextResponse } from 'next/server';
import { OidcConfigPatchBody as PatchBody } from '@/server/openapi/schemas/auth';
import { requireAdmin } from '@/server/auth/require-admin';
import { oidcConfigSetting, type OidcConfig } from '@/server/db/settings/oidc';
import { recordAuditEvent } from '@/server/audit/record';
import { shallowDiff } from '@/server/audit/diff';
import { extractProxyIp, extractClientIp } from '@/server/auth/forward-auth/peer';

export const dynamic = 'force-dynamic';

const MASK = '••••••••';

function maskedView(cfg: OidcConfig): OidcConfig {
  return { ...cfg, clientSecret: cfg.clientSecret.length > 0 ? MASK : '' };
}

export async function GET(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) return NextResponse.json({ message: ctx.message }, { status: ctx.status });
  const cfg = await oidcConfigSetting.get();
  return NextResponse.json({ config: maskedView(cfg) });
}

export async function PATCH(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) return NextResponse.json({ message: ctx.message }, { status: ctx.status });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = PatchBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid request body' }, { status: 400 });
  }

  const current = await oidcConfigSetting.get();
  const patch = parsed.data;

  let nextSecret = current.clientSecret;
  let nextEnabled = patch.enabled ?? current.enabled;
  if (patch.clientSecret === null) {
    nextSecret = '';
    nextEnabled = false;
  } else if (typeof patch.clientSecret === 'string' && patch.clientSecret.length > 0) {
    nextSecret = patch.clientSecret;
  }
  // empty string means "leave unchanged"

  const merged: OidcConfig = {
    ...current,
    ...patch,
    clientSecret: nextSecret,
    enabled: nextEnabled,
  };

  await oidcConfigSetting.set(merged);
  await recordAuditEvent({
    actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
    action: 'settings.update',
    target: { kind: 'settings', id: 'oidc-config' },
    metadata: {
      changedFields: shallowDiff(
        current as unknown as Record<string, unknown>,
        merged as unknown as Record<string, unknown>,
      ),
    },
    context: {
      peerIp: extractProxyIp(req),
      clientIp: extractClientIp(req),
      userAgent: req.headers.get('user-agent'),
    },
  });
  return NextResponse.json({ config: maskedView(merged) });
}
