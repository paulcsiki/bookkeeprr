import { NextResponse } from 'next/server';
import { requireAdmin } from '@/server/auth/require-admin';
import { cloudSettings } from '@/server/db/settings/cloud';
import { CloudClient } from '@/server/cloud/client';
import { recordAuditEvent } from '@/server/audit/record';
import { extractProxyIp, extractClientIp } from '@/server/auth/forward-auth/peer';
import { logger } from '@/server/logger';

export const dynamic = 'force-dynamic';

function fqdn(): string {
  return process.env.BOOKKEEPRR_PUBLIC_FQDN ?? 'bookkeeprr.local';
}

function configDir(): string {
  return process.env.BOOKKEEPRR_CONFIG_DIR ?? '/config';
}

export async function POST(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) {
    return NextResponse.json({ message: ctx.message }, { status: ctx.status });
  }

  const current = await cloudSettings.get();
  if (!current.enabled || !current.tenantId) {
    return NextResponse.json({ message: 'Cloud is not connected' }, { status: 409 });
  }

  const client = new CloudClient(current.cloudBaseUrl, configDir());
  const log = logger().child({ component: 'settings-cloud-disconnect' });
  let devicesRemoved: number;
  try {
    const res = await client.delete({
      fqdn: fqdn(),
      installUuid: current.installUuid,
      tenantId: current.tenantId,
    });
    devicesRemoved = res.devicesRemoved;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn({ err: message, tenantId: current.tenantId }, 'cloud delete failed');
    return NextResponse.json({ message: `Cloud disconnect failed: ${message}` }, { status: 502 });
  }

  const next = await cloudSettings.set({
    enabled: false,
    tenantId: null,
    acceptedEulaVersion: null,
    acceptedPrivacyVersion: null,
    acceptedAt: null,
    accessToken: null,
    accessTokenExpiresAt: null,
    lastRegisterError: null,
  });

  await recordAuditEvent({
    actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
    action: 'cloud.disconnect',
    target: { kind: 'settings', id: 'cloud' },
    metadata: {
      previousTenantId: current.tenantId,
      devicesRemoved,
    },
    context: {
      peerIp: extractProxyIp(req),
      clientIp: extractClientIp(req),
      userAgent: req.headers.get('user-agent'),
    },
  });

  return NextResponse.json({
    devicesRemoved,
    config: {
      enabled: next.enabled,
      cloudBaseUrl: next.cloudBaseUrl,
      tenantId: next.tenantId,
      installUuid: next.installUuid,
      acceptedEulaVersion: next.acceptedEulaVersion,
      acceptedPrivacyVersion: next.acceptedPrivacyVersion,
      acceptedAt: next.acceptedAt,
      lastRegisterError: next.lastRegisterError,
    },
  });
}
