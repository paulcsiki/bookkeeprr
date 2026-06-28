import { NextResponse } from 'next/server';
import { oidcConfigSetting, isOidcConfigured } from '@/server/db/settings/oidc';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const cfg = await oidcConfigSetting.get();
  return NextResponse.json({
    enabled: isOidcConfigured(cfg),
    buttonLabel: cfg.buttonLabel,
  });
}
