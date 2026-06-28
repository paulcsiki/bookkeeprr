import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../../integration/helpers/seed';
import {
  notificationsSetting,
  isDiscordConfigured,
  isAppriseConfigured,
  type NotificationsConfig,
} from '@/server/db/settings/notifications';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

describe('notificationsSetting', () => {
  it('returns the configured defaults when unset', async () => {
    const cfg = await notificationsSetting.get();
    expect(cfg.discordWebhookUrl).toBeNull();
    expect(cfg.appriseUrl).toBeNull();
    expect(cfg.discordUsername).toBe('bookkeeprr');
    expect(cfg.eventGrabSuccess).toBe(true);
    expect(cfg.eventImportSuccess).toBe(true);
    expect(cfg.eventFailure).toBe(true);
  });

  it('round-trips a full save', async () => {
    await notificationsSetting.set({
      discordWebhookUrl: 'https://discord.com/api/webhooks/123/abc',
      discordUsername: 'my-bot',
      discordAvatarUrl: 'https://example.com/a.png',
      appriseUrl: 'http://apprise:8000/notify/t',
      eventGrabSuccess: false,
      eventImportSuccess: true,
      eventFailure: true,
      eventUpdateAvailable: false,
      pushGrabSuccess: true,
      pushImportSuccess: true,
      pushFailure: true,
      pushUpdateAvailable: true,
    });
    const cfg = await notificationsSetting.get();
    expect(cfg.discordWebhookUrl).toBe('https://discord.com/api/webhooks/123/abc');
    expect(cfg.discordUsername).toBe('my-bot');
    expect(cfg.appriseUrl).toBe('http://apprise:8000/notify/t');
    expect(cfg.eventGrabSuccess).toBe(false);
    expect(cfg.eventImportSuccess).toBe(true);
  });
});

describe('isDiscordConfigured / isAppriseConfigured', () => {
  it('returns true only for non-null non-empty URLs', () => {
    expect(isDiscordConfigured({ discordWebhookUrl: null } as unknown as NotificationsConfig)).toBe(
      false,
    );
    expect(isDiscordConfigured({ discordWebhookUrl: '' } as unknown as NotificationsConfig)).toBe(
      false,
    );
    expect(isDiscordConfigured({ discordWebhookUrl: 'x' } as unknown as NotificationsConfig)).toBe(
      true,
    );
    expect(isAppriseConfigured({ appriseUrl: null } as unknown as NotificationsConfig)).toBe(false);
    expect(isAppriseConfigured({ appriseUrl: 'x' } as unknown as NotificationsConfig)).toBe(true);
  });
});
