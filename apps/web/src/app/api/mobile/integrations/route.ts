import { NextResponse } from 'next/server';
import { requireAdmin } from '@/server/auth/require-admin';
import {
  notificationsSetting,
  isDiscordConfigured,
  isAppriseConfigured,
} from '@/server/db/settings/notifications';

export const dynamic = 'force-dynamic';

/**
 * GET /api/mobile/integrations — the notification integrations summary for the
 * mobile Settings → Integrations screen.
 *
 * The web `/api/settings/notifications` endpoint returns the flat notifications
 * config (masked secrets + per-event toggles); the mobile `IntegrationsResponse`
 * schema expects a list of `{ kind, name, enabled, status, meta }`. This
 * endpoint reshapes the config into that list. Gated by `requireAdmin`
 * (cookie OR bearer token).
 */
export async function GET(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) {
    return NextResponse.json({ message: ctx.message }, { status: ctx.status });
  }

  const cfg = await notificationsSetting.get();
  const discordOn = isDiscordConfigured(cfg);
  const appriseOn = isAppriseConfigured(cfg);

  const integrations = [
    {
      kind: 'discord' as const,
      name: 'Discord',
      enabled: discordOn,
      status: (discordOn ? 'ok' : 'disabled') as 'ok' | 'disabled',
      meta: discordOn ? `as ${cfg.discordUsername}` : 'No webhook configured',
    },
    {
      kind: 'apprise' as const,
      name: 'Apprise',
      enabled: appriseOn,
      status: (appriseOn ? 'ok' : 'disabled') as 'ok' | 'disabled',
      meta: appriseOn ? 'URL configured' : 'No URL configured',
    },
  ];

  return NextResponse.json({ integrations });
}
