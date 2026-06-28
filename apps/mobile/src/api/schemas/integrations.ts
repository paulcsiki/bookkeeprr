import { z } from 'zod';

// ---------------------------------------------------------------------------
// Secret mask sentinel used across all integration settings routes
// ---------------------------------------------------------------------------

export const INTEGRATIONS_SECRET_SENTINEL = '••••••••';

const CONTENT_TYPES = ['manga', 'comic', 'light_novel', 'ebook', 'audiobook'] as const;

// ---------------------------------------------------------------------------
// Audiobookshelf
// ---------------------------------------------------------------------------

export const AudiobookshelfConfig = z.object({
  baseUrl: z.string().nullable(),
  apiToken: z.string().nullable(),
  libraryId: z.string().nullable(),
  contentTypes: z.array(z.enum(CONTENT_TYPES)),
  enabled: z.boolean(),
  configured: z.boolean(),
});
export type AudiobookshelfConfig = z.infer<typeof AudiobookshelfConfig>;

// ---------------------------------------------------------------------------
// Calibre
// ---------------------------------------------------------------------------

export const CalibreConfig = z.object({
  baseUrl: z.string().nullable(),
  username: z.string().nullable(),
  password: z.string().nullable(),
  libraryId: z.string(),
  contentTypes: z.array(z.enum(CONTENT_TYPES)),
  enabled: z.boolean(),
  configured: z.boolean(),
});
export type CalibreConfig = z.infer<typeof CalibreConfig>;

// ---------------------------------------------------------------------------
// Library list (ABS /libraries)
// ---------------------------------------------------------------------------

export const LibraryListResponse = z.object({
  libraries: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      mediaType: z.string(),
    }),
  ),
});
export type LibraryListResponse = z.infer<typeof LibraryListResponse>;

// ---------------------------------------------------------------------------
// Sync test result (ABS test + Calibre test)
// Both routes return { ok: true } 202 or { error: string } 502
// ---------------------------------------------------------------------------

export const SyncTestResult = z.object({
  ok: z.boolean().optional(),
  error: z.string().optional(),
});
export type SyncTestResult = z.infer<typeof SyncTestResult>;

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export const NotificationsConfig = z.object({
  discordWebhookUrl: z.string().nullable(),
  discordWebhookConfigured: z.boolean(),
  discordUsername: z.string(),
  discordAvatarUrl: z.string().nullable(),
  appriseUrl: z.string().nullable(),
  appriseConfigured: z.boolean(),
  eventGrabSuccess: z.boolean(),
  eventImportSuccess: z.boolean(),
  eventFailure: z.boolean(),
  eventUpdateAvailable: z.boolean(),
});
export type NotificationsConfig = z.infer<typeof NotificationsConfig>;

// ---------------------------------------------------------------------------
// Notifications test result
// POST /api/settings/notifications/test → { discord, apprise }
// Each channel: 'ok' | 'not-configured' | { error: string }
// ---------------------------------------------------------------------------

const TransportResult = z.union([
  z.literal('ok'),
  z.literal('not-configured'),
  z.object({ error: z.string() }),
]);

export const NotificationsTestResult = z.object({
  discord: TransportResult,
  apprise: TransportResult,
});
export type NotificationsTestResult = z.infer<typeof NotificationsTestResult>;

// Payload sent by PATCH (does NOT include push* keys)
export const NotificationsPatchBody = z.object({
  discordWebhookUrl: z.string().nullable(),
  discordUsername: z.string(),
  discordAvatarUrl: z.string().nullable(),
  appriseUrl: z.string().nullable(),
  eventGrabSuccess: z.boolean(),
  eventImportSuccess: z.boolean(),
  eventFailure: z.boolean(),
  eventUpdateAvailable: z.boolean(),
});
export type NotificationsPatchBody = z.infer<typeof NotificationsPatchBody>;
