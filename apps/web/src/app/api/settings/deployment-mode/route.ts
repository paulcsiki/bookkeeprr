import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/server/auth/require-admin';
import { deploymentModeOverrideSetting } from '@/server/db/settings/deployment';
import { recordAuditEvent } from '@/server/audit/record';
import { extractProxyIp, extractClientIp } from '@/server/auth/forward-auth/peer';

export const dynamic = 'force-dynamic';

// 'unknown' is a detection *result*, never a deliberate override — 'auto' already
// covers "let detection decide". Only real, forceable targets are accepted.
const PatchBody = z
  .object({
    mode: z.enum(['auto', 'docker', 'kubernetes']),
  })
  .strict();

export async function PATCH(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) {
    return NextResponse.json({ message: ctx.message }, { status: ctx.status });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', issues: parsed.error.issues },
      { status: 422 },
    );
  }
  const prev = await deploymentModeOverrideSetting.get();
  await deploymentModeOverrideSetting.set({ mode: parsed.data.mode });
  await recordAuditEvent({
    actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
    action: 'settings.update',
    target: { kind: 'settings', id: 'deployment-mode' },
    metadata: { from: prev.mode, to: parsed.data.mode },
    context: {
      peerIp: extractProxyIp(req),
      clientIp: extractClientIp(req),
      userAgent: req.headers.get('user-agent'),
    },
  });
  return NextResponse.json({ mode: parsed.data.mode });
}
