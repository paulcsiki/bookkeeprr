import { NextResponse } from 'next/server';
import { requireAdmin } from '@/server/auth/require-admin';
import { prowlarrConnectionSetting } from '@/server/db/settings/prowlarr';
import { syncProwlarr } from '@/server/indexers/prowlarr-sync';
import { ProwlarrError } from '@/server/integrations/prowlarr';
import { recordAuditEvent } from '@/server/audit/record';
import { extractProxyIp, extractClientIp } from '@/server/auth/forward-auth/peer';
import { ProwlarrSyncBody } from '@/server/openapi/schemas/indexers';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) return NextResponse.json({ message: ctx.message }, { status: ctx.status });
  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }
  const parsed = ProwlarrSyncBody.safeParse(body);
  if (parsed.success && parsed.data.url && parsed.data.apiKey) {
    await prowlarrConnectionSetting.set({ url: parsed.data.url, apiKey: parsed.data.apiKey });
  }
  try {
    const summary = await syncProwlarr();
    await recordAuditEvent({
      actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
      action: 'prowlarr.sync',
      target: { kind: 'settings', id: 'prowlarr' },
      metadata: summary,
      context: { peerIp: extractProxyIp(req), clientIp: extractClientIp(req), userAgent: req.headers.get('user-agent') },
    });
    return NextResponse.json(summary);
  } catch (err) {
    const msg = err instanceof ProwlarrError ? err.message : (err as Error).message;
    return NextResponse.json({ error: `prowlarr sync failed: ${msg}` }, { status: 502 });
  }
}
