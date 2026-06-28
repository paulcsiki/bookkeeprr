import { NextResponse } from 'next/server';
import type { AuthMode } from '@bookkeeprr/types';
import { getCurrentServerVersion } from '@/server/mobile/version';
import { loadOidcConfig } from '@/server/auth/oidc/client';
import {
  forwardAuthConfigSetting,
  isForwardAuthConfigured,
} from '@/server/db/settings/forward-auth';
import { cloudSettings } from '@/server/db/settings/cloud';

export const dynamic = 'force-dynamic';

/**
 * GET /api/mobile/handshake — anonymous. The mobile client calls this
 * during onboarding to validate the entered server URL and learn which
 * auth modes are available.
 */
export async function GET(): Promise<NextResponse> {
  const modes: AuthMode[] = ['password'];

  const oidcCfg = await loadOidcConfig();
  if (oidcCfg !== null) {
    modes.push('oidc');
  }

  const fwdCfg = await forwardAuthConfigSetting.get();
  if (isForwardAuthConfigured(fwdCfg)) {
    modes.push('forward_auth');
  }

  const cloud = await cloudSettings.get();
  const pushEnabled = cloud.enabled === true && cloud.tenantId !== null;

  return NextResponse.json({
    server_version: getCurrentServerVersion(),
    supported_auth_modes: modes,
    brand: 'bookkeeprr',
    push_enabled: pushEnabled,
  });
}
