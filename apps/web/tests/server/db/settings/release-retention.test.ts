import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../../integration/helpers/seed';
import {
  releaseRetentionSetting,
  ReleaseRetentionSchema,
} from '@/server/db/settings/release-retention';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

describe('releaseRetentionSetting', () => {
  it('returns documented defaults when unset', async () => {
    const cfg = await releaseRetentionSetting.get();
    expect(cfg.keepPerSeries).toBe(30);
    expect(cfg.olderThanDays).toBe(90);
  });

  it('round-trips a save', async () => {
    await releaseRetentionSetting.set({ keepPerSeries: 50, olderThanDays: 180 });
    const cfg = await releaseRetentionSetting.get();
    expect(cfg.keepPerSeries).toBe(50);
    expect(cfg.olderThanDays).toBe(180);
  });
});

describe('ReleaseRetentionSchema', () => {
  it('accepts the boundary values', () => {
    expect(ReleaseRetentionSchema.parse({ keepPerSeries: 0, olderThanDays: 1 })).toEqual({
      keepPerSeries: 0,
      olderThanDays: 1,
    });
    expect(ReleaseRetentionSchema.parse({ keepPerSeries: 10000, olderThanDays: 3650 })).toEqual({
      keepPerSeries: 10000,
      olderThanDays: 3650,
    });
  });

  it('rejects keepPerSeries below 0', () => {
    expect(() => ReleaseRetentionSchema.parse({ keepPerSeries: -1, olderThanDays: 30 })).toThrow();
  });

  it('rejects keepPerSeries above 10000', () => {
    expect(() =>
      ReleaseRetentionSchema.parse({ keepPerSeries: 10001, olderThanDays: 30 }),
    ).toThrow();
  });

  it('rejects olderThanDays below 1', () => {
    expect(() => ReleaseRetentionSchema.parse({ keepPerSeries: 30, olderThanDays: 0 })).toThrow();
  });

  it('rejects olderThanDays above 3650', () => {
    expect(() =>
      ReleaseRetentionSchema.parse({ keepPerSeries: 30, olderThanDays: 3651 }),
    ).toThrow();
  });

  it('rejects non-integer values', () => {
    expect(() =>
      ReleaseRetentionSchema.parse({ keepPerSeries: 30.5, olderThanDays: 90 }),
    ).toThrow();
  });
});
