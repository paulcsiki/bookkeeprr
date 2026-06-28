import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateBearer } from '@/server/mobile/bearer-middleware';
import { cloudSettings } from '@/server/db/settings/cloud';
import { CloudClient } from '@/server/cloud/client';
import { ensureAccessToken } from '@/server/cloud/access-token';
import { upsertPushDevice } from '@/server/db/mobile-push-devices';
import { logger } from '@/server/logger';

export const dynamic = 'force-dynamic';

const Body = z.object({
  device_token: z.string().min(1),
  platform: z.enum(['ios', 'android']),
});

function configDir(): string {
  return process.env.BOOKKEEPRR_CONFIG_DIR ?? '/config';
}

/**
 * POST /api/mobile/push/register — bearer-only. Registers (or refreshes)
 * the supplied APNs/FCM device token for the authenticated user. If the
 * cloud link is up, the device is also registered with the cloud so it
 * can receive pushes; the returned device_id is stored as `snsEndpointArn`.
 *
 * Cloud failures are non-fatal: the row is always persisted locally so
 * the mobile client can rely on a stable response and subsequent pushes
 * can pick up the registration once cloud recovers.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const auth = await authenticateBearer(req);
  if (auth.kind !== 'authenticated') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const cloud = await cloudSettings.get();
  let snsArn: string | null = null;
  if (cloud.enabled && cloud.tenantId !== null) {
    try {
      const accessToken = await ensureAccessToken();
      if (accessToken !== null) {
        const client = new CloudClient(cloud.cloudBaseUrl, configDir());
        const res = await client.registerDevice({
          tenantId: cloud.tenantId,
          accessToken,
          deviceToken: parsed.data.device_token,
          platform: parsed.data.platform,
        });
        snsArn = res.deviceId;
      }
    } catch (err) {
      // Best-effort: still persist locally so mobile can retry later.
      logger()
        .child({ component: 'mobile-push-register' })
        .warn(
          { err: err instanceof Error ? err.message : String(err) },
          'cloud register device failed',
        );
    }
  }

  const row = await upsertPushDevice({
    userId: auth.user.id,
    deviceToken: parsed.data.device_token,
    platform: parsed.data.platform,
    snsEndpointArn: snsArn,
  });
  return NextResponse.json(
    { id: row.id, registered_at: row.registeredAt.toISOString() },
    { status: 201 },
  );
}
