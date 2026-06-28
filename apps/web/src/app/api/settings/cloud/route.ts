import { NextResponse } from 'next/server';
import { requireAdmin } from '@/server/auth/require-admin';
import { cloudSettings } from '@/server/db/settings/cloud';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) {
    return NextResponse.json({ message: ctx.message }, { status: ctx.status });
  }
  const cfg = await cloudSettings.get();
  return NextResponse.json({
    config: {
      enabled: cfg.enabled,
      cloudBaseUrl: cfg.cloudBaseUrl,
      tenantId: cfg.tenantId,
      installUuid: cfg.installUuid,
      acceptedEulaVersion: cfg.acceptedEulaVersion,
      acceptedPrivacyVersion: cfg.acceptedPrivacyVersion,
      acceptedAt: cfg.acceptedAt,
      lastRegisterError: cfg.lastRegisterError,
    },
  });
}
