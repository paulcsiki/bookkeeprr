import { eq } from 'drizzle-orm';
import { logger } from '@/server/logger';
import {
  notificationsSetting,
  isDiscordConfigured,
  isAppriseConfigured,
  type NotificationsConfig,
} from '@/server/db/settings/notifications';
import { formatEvent } from './format';
import { sendDiscord } from './discord';
import { sendApprise } from './apprise';
import { sendPush } from './push';
import type { NotifyEvent } from './events';
import { getDownload } from '@/server/db/downloads';
import { getRelease } from '@/server/db/releases';
import { getSeries } from '@/server/db/series';
import { getDb } from '@/server/db/client';
import { users } from '@/server/db/schema';

export type { NotifyEvent } from './events';

function shouldFireForEvent(event: NotifyEvent, cfg: NotificationsConfig): boolean {
  if (event.kind === 'test') return true;
  if (event.kind === 'grab-success') return cfg.eventGrabSuccess;
  if (event.kind === 'import-success') return cfg.eventImportSuccess;
  if (event.kind === 'failure') return cfg.eventFailure;
  if (event.kind === 'update-available') return cfg.eventUpdateAvailable;
  return false;
}

/**
 * Resolve the set of user IDs that should receive a push for the given
 * event. The notification spec doesn't yet route per-user; for now every
 * non-disabled user is considered relevant. Mobile devices are then
 * looked up per-user inside sendPush().
 */
async function getRelevantUserIds(_event: NotifyEvent): Promise<number[]> {
  const rows = await getDb().select({ id: users.id }).from(users).where(eq(users.disabled, false));
  return rows.map((r) => r.id);
}

export async function notify(event: NotifyEvent): Promise<void> {
  const cfg = await notificationsSetting.get();
  if (!shouldFireForEvent(event, cfg)) return;

  const formatted = formatEvent(event);
  const log = logger().child({ component: 'notify', kind: event.kind });

  if (isDiscordConfigured(cfg)) {
    try {
      await sendDiscord(
        {
          webhookUrl: cfg.discordWebhookUrl!,
          username: cfg.discordUsername,
          avatarUrl: cfg.discordAvatarUrl,
        },
        formatted,
      );
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'discord notification failed');
    }
  }
  if (isAppriseConfigured(cfg)) {
    try {
      await sendApprise(cfg.appriseUrl!, formatted);
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'apprise notification failed');
    }
  }
  try {
    const userIds = await getRelevantUserIds(event);
    await sendPush(event, userIds, cfg);
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'push notification failed');
  }
}

/**
 * Fire a SINGLE import-success notification summarising a whole import run
 * (e.g. "Imported 72 files of <series>"). Replaces the old per-file fan-out
 * which spammed one notification per imported volume on large packs. Caller
 * passes the count of files that actually landed in the library; callers must
 * only invoke this when `count > 0`.
 */
export async function safeNotifyImportSummary(downloadId: number, count: number): Promise<void> {
  try {
    if (count <= 0) return;
    const dl = await getDownload(downloadId);
    if (!dl) return;
    const release = await getRelease(dl.releaseId);
    if (!release || release.seriesId === null) return;
    const series = await getSeries(release.seriesId);
    if (!series) return;
    await notify({ kind: 'import-success', series, count });
  } catch (err) {
    logger()
      .child({ component: 'notify' })
      .warn({ err: (err as Error).message }, 'safeNotifyImportSummary failed');
  }
}

export async function safeNotifyFailure(
  stage: 'grab' | 'import',
  downloadId: number | null,
  message: string,
): Promise<void> {
  try {
    let series: Awaited<ReturnType<typeof getSeries>> = null;
    let release: Awaited<ReturnType<typeof getRelease>> = null;
    if (downloadId !== null) {
      const dl = await getDownload(downloadId);
      if (dl) {
        release = await getRelease(dl.releaseId);
        if (release && release.seriesId !== null) {
          series = await getSeries(release.seriesId);
        }
      }
    }
    await notify({
      kind: 'failure',
      stage,
      series,
      release,
      error: { code: stage, message },
    });
  } catch (err) {
    logger()
      .child({ component: 'notify' })
      .warn({ err: (err as Error).message }, 'safeNotifyFailure failed');
  }
}
