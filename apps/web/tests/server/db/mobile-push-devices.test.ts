import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { insertUser } from '@/server/db/users';
import {
  upsertPushDevice,
  deletePushDevice,
  listPushDeviceTokensForUsers,
} from '@/server/db/mobile-push-devices';

let h: SeedHandle;
let userId: number;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  const u = await insertUser({
    username: 'push-user',
    passwordHash: 'h',
    role: 'user',
    mustChangePassword: false,
  });
  userId = u.id;
});
afterEach(() => h.cleanup());

describe('mobile_push_devices DAL', () => {
  it('upsert + list returns the token', async () => {
    await upsertPushDevice({
      userId,
      deviceToken: 'tok-1',
      platform: 'ios',
      snsEndpointArn: null,
    });
    const list = await listPushDeviceTokensForUsers([userId]);
    expect(list).toEqual([{ userId, deviceToken: 'tok-1' }]);
  });

  it('upsert is idempotent on (userId, deviceToken)', async () => {
    await upsertPushDevice({
      userId,
      deviceToken: 'tok-1',
      platform: 'ios',
      snsEndpointArn: null,
    });
    await upsertPushDevice({
      userId,
      deviceToken: 'tok-1',
      platform: 'ios',
      snsEndpointArn: 'arn:new',
    });
    const list = await listPushDeviceTokensForUsers([userId]);
    expect(list).toHaveLength(1);
  });

  it('delete removes the row', async () => {
    await upsertPushDevice({
      userId,
      deviceToken: 'tok-1',
      platform: 'ios',
      snsEndpointArn: null,
    });
    const removed = await deletePushDevice(userId, 'tok-1');
    expect(removed).toBe(1);
    const list = await listPushDeviceTokensForUsers([userId]);
    expect(list).toEqual([]);
  });
});
