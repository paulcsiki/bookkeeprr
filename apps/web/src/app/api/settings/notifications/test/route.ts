import { NextResponse } from 'next/server';
import {
  notificationsSetting,
  isDiscordConfigured,
  isAppriseConfigured,
} from '@/server/db/settings/notifications';
import { formatEvent } from '@/server/notifications/format';
import { sendDiscord } from '@/server/notifications/discord';
import { sendApprise } from '@/server/notifications/apprise';

export const dynamic = 'force-dynamic';

type TransportResult = 'ok' | 'not-configured' | { error: string };

export async function POST(): Promise<NextResponse> {
  const cfg = await notificationsSetting.get();
  const formatted = formatEvent({ kind: 'test' });

  const discordResult: TransportResult = isDiscordConfigured(cfg)
    ? await sendDiscord(
        {
          webhookUrl: cfg.discordWebhookUrl!,
          username: cfg.discordUsername,
          avatarUrl: cfg.discordAvatarUrl,
        },
        formatted,
      )
        .then(() => 'ok' as const)
        .catch((err: Error) => ({ error: err.message }))
    : 'not-configured';

  const appriseResult: TransportResult = isAppriseConfigured(cfg)
    ? await sendApprise(cfg.appriseUrl!, formatted)
        .then(() => 'ok' as const)
        .catch((err: Error) => ({ error: err.message }))
    : 'not-configured';

  return NextResponse.json({
    discord: discordResult,
    apprise: appriseResult,
  });
}
