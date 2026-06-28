import { NextResponse } from 'next/server';
import { ApiKeyPatchBody } from '@/server/openapi/schemas/settings';
import {
  apiKeySetting,
  isApiKeyEnabled,
  generateApiKey,
  type ApiKeyConfig,
} from '@/server/db/settings/api-key';
import { requireAdmin } from '@/server/auth/require-admin';
import { recordAuditEvent } from '@/server/audit/record';
import { shallowDiff } from '@/server/audit/diff';
import { extractProxyIp, extractClientIp } from '@/server/auth/forward-auth/peer';

export const dynamic = 'force-dynamic';

function mask(cfg: ApiKeyConfig): {
  enabled: boolean;
  key: string;
  createdAt: string | null;
} {
  return {
    enabled: isApiKeyEnabled(cfg),
    key: isApiKeyEnabled(cfg) ? cfg.key! : '',
    createdAt: cfg.createdAt,
  };
}

export async function GET(): Promise<NextResponse> {
  const cfg = await apiKeySetting.get();
  return NextResponse.json(mask(cfg));
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
  const parsed = ApiKeyPatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const before = await apiKeySetting.get();
  let next: ApiKeyConfig;
  if (parsed.data.action === 'generate') {
    const key = generateApiKey();
    const createdAt = new Date().toISOString();
    next = { key, createdAt };
    await apiKeySetting.set(next);
  } else {
    next = { key: null, createdAt: null };
    await apiKeySetting.set(next);
  }
  await recordAuditEvent({
    actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
    action: 'settings.update',
    target: { kind: 'settings', id: 'api-key' },
    metadata: {
      changedFields: shallowDiff(
        before as unknown as Record<string, unknown>,
        next as unknown as Record<string, unknown>,
      ),
    },
    context: {
      peerIp: extractProxyIp(req),
      clientIp: extractClientIp(req),
      userAgent: req.headers.get('user-agent'),
    },
  });
  if (parsed.data.action === 'generate') {
    return NextResponse.json({ enabled: true, key: next.key, createdAt: next.createdAt });
  }
  return NextResponse.json({ enabled: false, key: '', createdAt: null });
}
