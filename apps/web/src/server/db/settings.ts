import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import { getDb } from './client';
import { settings } from './schema';
import { withWriteLock } from './write-lock';

export type SettingAccessor<T> = {
  key: string;
  get(): Promise<T>;
  set(value: T): Promise<void>;
};

export function defineSetting<T>(
  key: string,
  schema: z.ZodType<T>,
  defaultValue: T,
): SettingAccessor<T> {
  return {
    key,
    async get(): Promise<T> {
      const db = getDb();
      const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
      if (rows.length === 0) return defaultValue;
      const parsed = JSON.parse(rows[0]!.valueJson);
      return schema.parse(parsed);
    },
    async set(value: T): Promise<void> {
      const validated = schema.parse(value);
      const db = getDb();
      const json = JSON.stringify(validated);
      await withWriteLock(() =>
        db
          .insert(settings)
          .values({ key, valueJson: json })
          .onConflictDoUpdate({
            target: settings.key,
            set: { valueJson: json, updatedAt: new Date() },
          }),
      );
    },
  };
}
