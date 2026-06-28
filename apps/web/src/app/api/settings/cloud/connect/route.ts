import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/server/auth/require-admin';
import { cloudSettings } from '@/server/db/settings/cloud';
import { CloudClient } from '@/server/cloud/client';
import { recordAuditEvent } from '@/server/audit/record';
import { extractProxyIp, extractClientIp } from '@/server/auth/forward-auth/peer';

export const dynamic = 'force-dynamic';

const Body = z
  .object({
    acceptedEulaVersion: z.string().min(1),
    acceptedPrivacyVersion: z.string().min(1),
  })
  .strict();

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
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid body', issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const current = await cloudSettings.get();
  if (current.enabled && current.tenantId) {
    return NextResponse.json(
      { message: 'Cloud is already connected; disconnect first to re-register' },
      { status: 409 },
    );
  }

  const client = new CloudClient(current.cloudBaseUrl, configDir());
  let result;
  try {
    result = await client.register({
      fqdn: fqdn(),
      installUuid: current.installUuid,
      acceptedEulaVersion: parsed.data.acceptedEulaVersion,
      acceptedPrivacyVersion: parsed.data.acceptedPrivacyVersion,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await cloudSettings.set({ lastRegisterError: message });
    return NextResponse.json({ message: `Cloud registration failed: ${message}` }, { status: 502 });
  }

  const acceptedAt = new Date().toISOString();
  const next = await cloudSettings.set({
    enabled: true,
    tenantId: result.tenantId,
    acceptedEulaVersion: parsed.data.acceptedEulaVersion,
    acceptedPrivacyVersion: parsed.data.acceptedPrivacyVersion,
    acceptedAt,
    accessToken: null,
    accessTokenExpiresAt: null,
    lastRegisterError: null,
  });

  await recordAuditEvent({
    actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
    action: 'cloud.connect',
    target: { kind: 'settings', id: 'cloud' },
    metadata: {
      tenantId: result.tenantId,
      acceptedEulaVersion: parsed.data.acceptedEulaVersion,
      acceptedPrivacyVersion: parsed.data.acceptedPrivacyVersion,
    },
    context: {
      peerIp: extractProxyIp(req),
      clientIp: extractClientIp(req),
      userAgent: req.headers.get('user-agent'),
    },
  });

  return NextResponse.json({
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
