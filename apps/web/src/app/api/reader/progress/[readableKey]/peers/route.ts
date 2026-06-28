import { type NextRequest, NextResponse } from 'next/server';
import { parseReadableKey } from '@bookkeeprr/types';
import { requireUserId } from '@/server/auth/require-user';
import { getPeers } from '@/server/db/reading-progress';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ readableKey: string }> };

/** Validate the readableKey path param; null when malformed. */
function resolveKey(key: string): string | null {
  try {
    parseReadableKey(key);
    return key;
  } catch {
    return null;
  }
}

export type PeersResponse = {
  peers: Array<{
    deviceId: string;
    deviceName: string | null;
    position: number;
    updatedAt: string;
  }>;
};

/**
 * GET /api/reader/progress/<readableKey>/peers
 *
 * Returns progress rows for this readable from all OTHER devices owned by the
 * authenticated user. Rows with no deviceId (legacy writes) are excluded.
 *
 * Query param: `selfDeviceId` — the calling device's own ID. Rows matching
 * this ID are omitted from the response. Required; returns 400 if absent.
 */
export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const userId = await requireUserId(req);
  if (userId === null) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { readableKey } = await ctx.params;
  const key = resolveKey(readableKey);
  if (key === null) return NextResponse.json({ error: 'invalid readableKey' }, { status: 400 });

  const selfDeviceId = req.nextUrl.searchParams.get('selfDeviceId');
  if (!selfDeviceId) {
    return NextResponse.json({ error: 'selfDeviceId query param required' }, { status: 400 });
  }

  const rows = await getPeers(userId, key, selfDeviceId);

  const payload: PeersResponse = {
    peers: rows.map((r) => ({
      deviceId: r.deviceId,
      deviceName: r.deviceName,
      position: r.position,
      updatedAt: r.updatedAt.toISOString(),
    })),
  };
  return NextResponse.json(payload, { status: 200 });
}
