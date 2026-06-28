import { NextResponse } from 'next/server';
import { NotificationsPatchBody } from '@/server/openapi/schemas/settings';
import {
  notificationsSetting,
  isDiscordConfigured,
  isAppriseConfigured,
  type NotificationsConfig,
} from '@/server/db/settings/notifications';
import { requireAdmin } from '@/server/auth/require-admin';
import { recordAuditEvent } from '@/server/audit/record';
import { shallowDiff } from '@/server/audit/diff';
import { extractProxyIp, extractClientIp } from '@/server/auth/forward-auth/peer';

export const dynamic = 'force-dynamic';

const MASK = '••••••••';

export async function GET(): Promise<NextResponse> {
  const cfg = await notificationsSetting.get();
  return NextResponse.json({
    discordWebhookUrl: isDiscordConfigured(cfg) ? MASK : null,
    discordWebhookConfigured: isDiscordConfigured(cfg),
    discordUsername: cfg.discordUsername,
    discordAvatarUrl: cfg.discordAvatarUrl,
    appriseUrl: isAppriseConfigured(cfg) ? MASK : null,
    appriseConfigured: isAppriseConfigured(cfg),
    eventGrabSuccess: cfg.eventGrabSuccess,
    eventImportSuccess: cfg.eventImportSuccess,
    eventFailure: cfg.eventFailure,
    eventUpdateAvailable: cfg.eventUpdateAvailable,
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
  const parsed = NotificationsPatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const existing = await notificationsSetting.get();
  const next: NotificationsConfig = {
    discordWebhookUrl:
      parsed.data.discordWebhookUrl === ''
        ? existing.discordWebhookUrl
        : parsed.data.discordWebhookUrl,
    discordUsername: parsed.data.discordUsername,
    discordAvatarUrl:
      parsed.data.discordAvatarUrl === ''
        ? existing.discordAvatarUrl
        : parsed.data.discordAvatarUrl,
    appriseUrl: parsed.data.appriseUrl === '' ? existing.appriseUrl : parsed.data.appriseUrl,
    eventGrabSuccess: parsed.data.eventGrabSuccess,
    eventImportSuccess: parsed.data.eventImportSuccess,
    eventFailure: parsed.data.eventFailure,
    eventUpdateAvailable: parsed.data.eventUpdateAvailable ?? existing.eventUpdateAvailable,
    pushGrabSuccess: existing.pushGrabSuccess,
    pushImportSuccess: existing.pushImportSuccess,
    pushFailure: existing.pushFailure,
    pushUpdateAvailable: existing.pushUpdateAvailable,
  };
  await notificationsSetting.set(next);
  await recordAuditEvent({
    actor: { kind: 'user', userId: ctx.user.id, username: ctx.user.username },
    action: 'settings.update',
    target: { kind: 'settings', id: 'notifications' },
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
