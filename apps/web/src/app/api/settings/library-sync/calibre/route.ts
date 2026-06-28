import { NextResponse } from 'next/server';
import { CalibrePatchBody } from '@/server/openapi/schemas/settings-library-sync';
import {
  calibreSetting,
  isCalibreConfigured,
  type CalibreConfig,
} from '@/server/db/settings/calibre';
import { requireAdmin } from '@/server/auth/require-admin';
import { recordAuditEvent } from '@/server/audit/record';
import { shallowDiff } from '@/server/audit/diff';
import { extractProxyIp, extractClientIp } from '@/server/auth/forward-auth/peer';

export const dynamic = 'force-dynamic';
const MASK = '••••••••';

export async function GET(): Promise<NextResponse> {
  const cfg = await calibreSetting.get();
  return NextResponse.json({
    baseUrl: cfg.baseUrl,
    username: cfg.username,
    password: cfg.password && cfg.password.length > 0 ? MASK : null,
    libraryId: cfg.libraryId,
    contentTypes: cfg.contentTypes,
    enabled: cfg.enabled,
    configured: isCalibreConfigured(cfg),
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
  const parsed = CalibrePatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const existing = await calibreSetting.get();
  const next: CalibreConfig = {
    baseUrl: parsed.data.baseUrl === '' ? existing.baseUrl : parsed.data.baseUrl,
    username: parsed.data.username === '' ? existing.username : parsed.data.username,
    password: parsed.data.password === '' ? existing.password : parsed.data.password,
    libraryId: parsed.data.libraryId,
    contentTypes: parsed.data.contentTypes,
    enabled: parsed.data.enabled,
  };
  await calibreSetting.set(next);
  await recordAuditEvent({
    actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
    action: 'settings.update',
    target: { kind: 'settings', id: 'calibre' },
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
