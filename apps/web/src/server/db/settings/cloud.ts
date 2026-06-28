import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../client';
import { settings } from '../schema';
import { withWriteLock } from '../write-lock';

const DEFAULT_CLOUD_BASE_URL = 'https://cloud.bookkeeprr.io';
const SETTINGS_KEY = 'cloud';

export const CloudSettingsSchema = z.object({
  enabled: z.boolean(),
  cloudBaseUrl: z.string().url(),
  tenantId: z.string().nullable(),
  installUuid: z.string().uuid(),
  acceptedEulaVersion: z.string().nullable(),
  acceptedPrivacyVersion: z.string().nullable(),
  acceptedAt: z.string().nullable(),
  accessToken: z.string().nullable(),
  accessTokenExpiresAt: z.string().nullable(),
  lastRegisterError: z.string().nullable(),
});

export type CloudSettings = z.infer<typeof CloudSettingsSchema>;

function buildDefaults(): CloudSettings {
  return {
    enabled: false,
    cloudBaseUrl: DEFAULT_CLOUD_BASE_URL,
    tenantId: null,
    installUuid: randomUUID(),
    acceptedEulaVersion: null,
    acceptedPrivacyVersion: null,
    acceptedAt: null,
    accessToken: null,
    accessTokenExpiresAt: null,
    lastRegisterError: null,
  };
}

async function readRow(): Promise<CloudSettings | null> {
  const db = getDb();
  const rows = await db.select().from(settings).where(eq(settings.key, SETTINGS_KEY)).limit(1);
  if (rows.length === 0) return null;
  const parsed = JSON.parse(rows[0]!.valueJson);
  return CloudSettingsSchema.parse(parsed);
}

async function writeRow(value: CloudSettings): Promise<void> {
  const validated = CloudSettingsSchema.parse(value);
  const json = JSON.stringify(validated);
  await withWriteLock(() =>
    getDb()
      .insert(settings)
      .values({ key: SETTINGS_KEY, valueJson: json })
      .onConflictDoUpdate({
        target: settings.key,
        set: { valueJson: json, updatedAt: new Date() },
      }),
  );
}

export const cloudSettings = {
  key: SETTINGS_KEY,
  async get(): Promise<CloudSettings> {
    const existing = await readRow();
    if (existing) return existing;
    const fresh = buildDefaults();
    await writeRow(fresh);
    return fresh;
  },
  async set(patch: Partial<CloudSettings>): Promise<CloudSettings> {
    const current = await this.get();
    const next: CloudSettings = { ...current, ...patch };
    await writeRow(next);
    return next;
  },
};
