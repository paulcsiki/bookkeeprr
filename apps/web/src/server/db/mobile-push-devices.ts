import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from './client';
import { mobilePushDevices, type MobilePushDeviceRow } from './schema';
import { withWriteLock } from './write-lock';

export type UpsertPushDeviceInput = {
  userId: number;
  deviceToken: string;
  platform: 'ios' | 'android';
  snsEndpointArn: string | null;
};

export async function upsertPushDevice(args: UpsertPushDeviceInput): Promise<MobilePushDeviceRow> {
  return withWriteLock(async () => {
    const db = getDb();
    const now = new Date();
    const existing = await db
      .select()
      .from(mobilePushDevices)
      .where(
        and(
          eq(mobilePushDevices.userId, args.userId),
          eq(mobilePushDevices.deviceToken, args.deviceToken),
        ),
      )
      .limit(1);
    const prior = existing[0];
    if (prior !== undefined) {
      await db
        .update(mobilePushDevices)
        .set({
          snsEndpointArn: args.snsEndpointArn,
          platform: args.platform,
          lastSeenAt: now,
        })
        .where(eq(mobilePushDevices.id, prior.id));
      return {
        ...prior,
        snsEndpointArn: args.snsEndpointArn,
        platform: args.platform,
        lastSeenAt: now,
      };
    }
    const inserted = await db
      .insert(mobilePushDevices)
      .values({
        userId: args.userId,
        deviceToken: args.deviceToken,
        platform: args.platform,
        snsEndpointArn: args.snsEndpointArn,
        registeredAt: now,
        lastSeenAt: now,
      })
      .returning();
    const row = inserted[0];
    if (row === undefined) {
      throw new Error('upsertPushDevice: insert returned no row');
    }
    return row;
  });
}

export async function deletePushDevice(userId: number, deviceToken: string): Promise<number> {
  return withWriteLock(async () => {
    const db = getDb();
    const res = await db
      .delete(mobilePushDevices)
      .where(
        and(eq(mobilePushDevices.userId, userId), eq(mobilePushDevices.deviceToken, deviceToken)),
      );
    return res.changes ?? 0;
  });
}

export async function listPushDeviceTokensForUsers(
  userIds: number[],
): Promise<{ userId: number; deviceToken: string }[]> {
  if (userIds.length === 0) return [];
  const db = getDb();
  const rows = await db
    .select({
      userId: mobilePushDevices.userId,
      deviceToken: mobilePushDevices.deviceToken,
    })
    .from(mobilePushDevices)
    .where(inArray(mobilePushDevices.userId, userIds));
  return rows;
}
