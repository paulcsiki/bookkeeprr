import { NextResponse } from 'next/server';
import { ForwardAuthConfigPatchBody as PatchBody } from '@/server/openapi/schemas/auth';
import { requireAdmin } from '@/server/auth/require-admin';
import {
  forwardAuthConfigSetting,
  type ForwardAuthConfig,
} from '@/server/db/settings/forward-auth';
import { isCidrValid, isIpInCidrList } from '@/server/auth/forward-auth/cidr';
import { extractProxyIp, extractClientIp } from '@/server/auth/forward-auth/peer';
import { recordAuditEvent } from '@/server/audit/record';
import { shallowDiff } from '@/server/audit/diff';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) {
    return NextResponse.json({ message: ctx.message }, { status: ctx.status });
  }
  const cfg = await forwardAuthConfigSetting.get();
  return NextResponse.json({ config: cfg });
}

export async function PATCH(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) {
    return NextResponse.json({ message: ctx.message }, { status: ctx.status });
  }

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

  const current = await forwardAuthConfigSetting.get();
  const patch = parsed.data;

  const nextCidrs = patch.trustedProxies ?? current.trustedProxies;
  const invalidCidrs = nextCidrs.filter((c) => !isCidrValid(c));
  if (invalidCidrs.length > 0) {
    return NextResponse.json({ error: 'invalid_cidr', invalidCidrs }, { status: 422 });
  }

  const merged: ForwardAuthConfig = {
    ...current,
    ...patch,
  };

  // Enable transition guard: false → true MUST satisfy current-request validation.
  if (merged.enabled && !current.enabled) {
    const peer = extractProxyIp(req);
    const client = extractClientIp(req);
    const headerValue = req.headers.get(merged.userHeader);
    const peerInTrustedProxies = peer !== null && isIpInCidrList(peer, merged.trustedProxies);
    const userHeaderPresent = headerValue !== null && headerValue.length > 0;
    if (!peerInTrustedProxies || !userHeaderPresent) {
      return NextResponse.json(
        {
          ready: false,
          peerIp: peer,
          clientIp: client,
          peerInTrustedProxies,
          userHeaderName: merged.userHeader,
          userHeaderPresent,
          userHeaderValue: headerValue,
        },
        { status: 422 },
      );
    }
  }

  await forwardAuthConfigSetting.set(merged);
  await recordAuditEvent({
    actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
    action: 'settings.update',
    target: { kind: 'settings', id: 'forward-auth-config' },
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
  return NextResponse.json({ config: merged });
}
