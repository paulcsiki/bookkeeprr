import { z } from 'zod';
import { defineSetting } from '../settings';

export const NotificationsSchema = z.object({
  discordWebhookUrl: z.string().nullable(),
  discordUsername: z.string(),
  discordAvatarUrl: z.string().nullable(),
  appriseUrl: z.string().nullable(),
  eventGrabSuccess: z.boolean(),
  eventImportSuccess: z.boolean(),
  eventFailure: z.boolean(),
  eventUpdateAvailable: z.boolean(),
  pushGrabSuccess: z.boolean().default(true),
  pushImportSuccess: z.boolean().default(true),
  pushFailure: z.boolean().default(true),
  pushUpdateAvailable: z.boolean().default(true),
});

export type NotificationsConfig = z.infer<typeof NotificationsSchema>;

const DEFAULT: NotificationsConfig = {
  discordWebhookUrl: null,
  discordUsername: 'bookkeeprr',
  discordAvatarUrl: null,
  appriseUrl: null,
  eventGrabSuccess: true,
  eventImportSuccess: true,
  eventFailure: true,
  eventUpdateAvailable: false,
  pushGrabSuccess: true,
  pushImportSuccess: true,
  pushFailure: true,
  pushUpdateAvailable: true,
};

export const notificationsSetting = defineSetting('notifications', NotificationsSchema, DEFAULT);

export function isDiscordConfigured(cfg: NotificationsConfig): boolean {
  return cfg.discordWebhookUrl !== null && cfg.discordWebhookUrl.length > 0;
}

export function isAppriseConfigured(cfg: NotificationsConfig): boolean {
  return cfg.appriseUrl !== null && cfg.appriseUrl.length > 0;
}
