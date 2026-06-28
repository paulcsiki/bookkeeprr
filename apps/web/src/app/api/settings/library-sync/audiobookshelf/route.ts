import { NextResponse } from 'next/server';
import { AudiobookshelfPatchBody } from '@/server/openapi/schemas/settings-library-sync';
import {
  audiobookshelfSetting,
  isAudiobookshelfConfigured,
  type AudiobookshelfConfig,
} from '@/server/db/settings/audiobookshelf';
import { requireAdmin } from '@/server/auth/require-admin';
import { recordAuditEvent } from '@/server/audit/record';
import { shallowDiff } from '@/server/audit/diff';
import { extractProxyIp, extractClientIp } from '@/server/auth/forward-auth/peer';

export const dynamic = 'force-dynamic';
const MASK = '••••••••';

export async function GET(): Promise<NextResponse> {
  const cfg = await audiobookshelfSetting.get();
  return NextResponse.json({
    baseUrl: cfg.baseUrl,
    apiToken: cfg.apiToken && cfg.apiToken.length > 0 ? MASK : null,
    libraryId: cfg.libraryId,
    contentTypes: cfg.contentTypes,
    enabled: cfg.enabled,
    configured: isAudiobookshelfConfigured(cfg),
  });
}

export async function PATCH(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) return NextResponse.json({ message: ctx.message }, { status: ctx.status });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const parsed = AudiobookshelfPatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const existing = await audiobookshelfSetting.get();
  const next: AudiobookshelfConfig = {
    baseUrl: parsed.data.baseUrl === '' ? existing.baseUrl : parsed.data.baseUrl,
    apiToken: parsed.data.apiToken === '' ? existing.apiToken : parsed.data.apiToken,
    libraryId: parsed.data.libraryId === '' ? existing.libraryId : parsed.data.libraryId,
    contentTypes: parsed.data.contentTypes,
    enabled: parsed.data.enabled,
  };
  await audiobookshelfSetting.set(next);
  await recordAuditEvent({
    actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
    action: 'settings.update',
    target: { kind: 'settings', id: 'audiobookshelf' },
    metadata: {
      changedFields: shallowDiff(
        existing as unknown as Record<string, unknown>,
        next as unknown as Record<string, unknown>,
      ),
    },
    context: {
      peerIp: extractProxyIp(req),
      clientIp: extractClientIp(req),
      userAgent: req.headers.get('user-agent'),
    },
  });
  return NextResponse.json({ ok: true });
}
