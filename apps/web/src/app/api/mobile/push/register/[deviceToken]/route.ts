import { NextResponse } from 'next/server';
import { authenticateBearer } from '@/server/mobile/bearer-middleware';
import { cloudSettings } from '@/server/db/settings/cloud';
import { CloudClient } from '@/server/cloud/client';
import { ensureAccessToken } from '@/server/cloud/access-token';
import { deletePushDevice } from '@/server/db/mobile-push-devices';
import { logger } from '@/server/logger';

export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ deviceToken: string }>;
}

function configDir(): string {
  return process.env.BOOKKEEPRR_CONFIG_DIR ?? '/config';
}

/**
 * DELETE /api/mobile/push/register/{deviceToken} — bearer-only.
 * Removes the device registration locally and, when cloud is enabled,
 * also unregisters it on the cloud side. Cloud failures are non-fatal:
 * the local row is always removed so the client can confidently treat
 * the device as deregistered.
 */
export async function DELETE(req: Request, ctx: Ctx): Promise<NextResponse> {
  const auth = await authenticateBearer(req);
  if (auth.kind !== 'authenticated') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { deviceToken: rawToken } = await ctx.params;
  const deviceToken = decodeURIComponent(rawToken);

  const cloud = await cloudSettings.get();
  if (cloud.enabled && cloud.tenantId !== null) {
    try {
      const accessToken = await ensureAccessToken();
      if (accessToken !== null) {
        const client = new CloudClient(cloud.cloudBaseUrl, configDir());
        await client.unregisterDevice({
          tenantId: cloud.tenantId,
          accessToken,
          deviceToken,
        });
      }
    } catch (err) {
      logger()
        .child({ component: 'mobile-push-register' })
        .warn(
          { err: err instanceof Error ? err.message : String(err) },
          'cloud unregister device failed',
        );
    }
  }

  await deletePushDevice(auth.user.id, deviceToken);
  return new NextResponse(null, { status: 204 });
}
