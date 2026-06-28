import { logger } from '@/server/logger';
import { cloudSettings } from '@/server/db/settings/cloud';
import { CloudClient } from '@/server/cloud/client';
import { ensureAccessToken } from '@/server/cloud/access-token';
import { listPushDeviceTokensForUsers } from '@/server/db/mobile-push-devices';
import { formatEvent } from './format';
import type { NotifyEvent } from './events';
import type { NotificationsConfig } from '@/server/db/settings/notifications';

function configDir(): string {
  return process.env.BOOKKEEPRR_CONFIG_DIR ?? '/config';
}

function shouldPush(event: NotifyEvent, cfg: NotificationsConfig): boolean {
  if (event.kind === 'test') return true;
  if (event.kind === 'grab-success') return cfg.pushGrabSuccess;
  if (event.kind === 'import-success') return cfg.pushImportSuccess;
  if (event.kind === 'failure') return cfg.pushFailure;
  if (event.kind === 'update-available') return cfg.pushUpdateAvailable;
  return false;
}

function deepLinkFor(event: NotifyEvent): string {
  if ('series' in event && event.series) {
    return `bookkeeprr://library/series/${event.series.id}`;
  }
  return 'bookkeeprr://activity';
}

/**
 * Dispatch a push notification for the given event to the supplied users'
 * registered mobile devices via the cloud /v1/push endpoint.
 *
 * No-ops when:
 *  - the per-event push toggle on `cfg` is off,
 *  - cloud is disabled / not yet registered (no tenantId),
 *  - none of the supplied users have any registered devices,
 *  - the access-token exchange fails.
 *
 * Errors from the cloud client are logged at warn level and swallowed:
 * push is best-effort and must not break the surrounding notify() call.
 */
export async function sendPush(
  event: NotifyEvent,
  userIds: number[],
  cfg: NotificationsConfig,
): Promise<void> {
  if (!shouldPush(event, cfg)) return;
  const cloud = await cloudSettings.get();
  if (!cloud.enabled || !cloud.tenantId) return;
  if (userIds.length === 0) return;
  const tokens = await listPushDeviceTokensForUsers(userIds);
  if (tokens.length === 0) return;

  const accessToken = await ensureAccessToken();
  if (accessToken === null) return;

  const log = logger().child({ component: 'notify-push', kind: event.kind });
  const formatted = formatEvent(event);
  const client = new CloudClient(cloud.cloudBaseUrl, configDir());
  try {
    const res = await client.push({
      accessToken,
      deviceTokens: tokens.map((t) => t.deviceToken),
      payload: {
        title: formatted.title,
        body: formatted.body,
        deepLink: deepLinkFor(event),
        data: { kind: event.kind },
      },
    });
    log.info({ results: res.results.length }, 'push delivered');
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, 'push failed');
  }
}
