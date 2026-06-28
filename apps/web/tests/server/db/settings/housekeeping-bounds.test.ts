import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../../integration/helpers/seed';
import { jobRetentionSetting, backupRetentionSetting } from '@/server/db/settings/housekeeping';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

describe('JobRetention bounds', () => {
  it('rejects terminalDays < 1', async () => {
    await expect(jobRetentionSetting.set({ terminalDays: 0, errorDays: 90 })).rejects.toThrow();
  });
  it('rejects terminalDays > 3650', async () => {
    await expect(jobRetentionSetting.set({ terminalDays: 3651, errorDays: 90 })).rejects.toThrow();
  });
  it('accepts terminalDays = 1', async () => {
    await expect(
      jobRetentionSetting.set({ terminalDays: 1, errorDays: 1 }),
    ).resolves.toBeUndefined();
  });
  it('accepts terminalDays = 3650', async () => {
    await expect(
      jobRetentionSetting.set({ terminalDays: 3650, errorDays: 3650 }),
    ).resolves.toBeUndefined();
  });
});

describe('BackupRetention bounds', () => {
  it('accepts daily = 0', async () => {
    await expect(backupRetentionSetting.set({ daily: 0, monthlyDay1: 0 })).resolves.toBeUndefined();
  });
  it('rejects daily < 0', async () => {
    await expect(backupRetentionSetting.set({ daily: -1, monthlyDay1: 12 })).rejects.toThrow();
  });
  it('rejects daily > 365', async () => {
    await expect(backupRetentionSetting.set({ daily: 366, monthlyDay1: 12 })).rejects.toThrow();
  });
  it('accepts daily = 365', async () => {
    await expect(
      backupRetentionSetting.set({ daily: 365, monthlyDay1: 365 }),
    ).resolves.toBeUndefined();
  });
});
