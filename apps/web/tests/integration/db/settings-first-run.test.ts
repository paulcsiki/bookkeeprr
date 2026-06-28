import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { firstRunCompleteSetting } from '@/server/db/settings/first-run';
import { jobRetentionSetting, backupRetentionSetting } from '@/server/db/settings/housekeeping';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb();
});
afterEach(() => h.cleanup());

describe('firstRunCompleteSetting', () => {
  it('defaults to false', async () => {
    expect(await firstRunCompleteSetting.get()).toBe(false);
  });
  it('roundtrips true', async () => {
    await firstRunCompleteSetting.set(true);
    expect(await firstRunCompleteSetting.get()).toBe(true);
  });
  it('idempotent set', async () => {
    await firstRunCompleteSetting.set(true);
    await firstRunCompleteSetting.set(true);
    expect(await firstRunCompleteSetting.get()).toBe(true);
  });
});

describe('housekeeping settings', () => {
  it('jobRetentionSetting default', async () => {
    expect(await jobRetentionSetting.get()).toEqual({ terminalDays: 30, errorDays: 90 });
  });
  it('jobRetentionSetting roundtrip', async () => {
    await jobRetentionSetting.set({ terminalDays: 7, errorDays: 45 });
    expect(await jobRetentionSetting.get()).toEqual({ terminalDays: 7, errorDays: 45 });
  });
  it('backupRetentionSetting default', async () => {
    expect(await backupRetentionSetting.get()).toEqual({ daily: 14, monthlyDay1: 12 });
  });
});
