import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../../integration/helpers/seed';
import {
  scoringWeightsSetting,
  adultFilterSetting,
  ScoringWeightsSchema,
  AdultFilterSchema,
  DEFAULT_WEIGHTS,
} from '@/server/db/settings/matcher';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

describe('scoringWeightsSetting', () => {
  it('returns documented defaults when unset', async () => {
    const cfg = await scoringWeightsSetting.get();
    expect(cfg).toEqual({
      groupTopWeight: 100,
      groupStepDown: 10,
      batchBonus: 30,
      seederMultiplier: 5,
      trustedBonus: 10,
      remakePenalty: -15,
      minSeeders: 1,
    });
    expect(cfg).toEqual(DEFAULT_WEIGHTS);
  });

  it('round-trips a save', async () => {
    await scoringWeightsSetting.set({
      groupTopWeight: 200,
      groupStepDown: 20,
      batchBonus: 50,
      seederMultiplier: 8,
      trustedBonus: 15,
      remakePenalty: -25,
      minSeeders: 3,
    });
    const cfg = await scoringWeightsSetting.get();
    expect(cfg.groupTopWeight).toBe(200);
    expect(cfg.seederMultiplier).toBe(8);
    expect(cfg.minSeeders).toBe(3);
  });

  it('defaults minSeeders to 1 when parsing settings stored before the field existed', () => {
    // Pre-existing rows have no minSeeders key; .default(1) must backfill it so
    // the read never throws and the seeder floor is on by default.
    const legacy = {
      groupTopWeight: 100,
      groupStepDown: 10,
      batchBonus: 30,
      seederMultiplier: 5,
      trustedBonus: 10,
      remakePenalty: -15,
    };
    expect(ScoringWeightsSchema.parse(legacy).minSeeders).toBe(1);
  });

  it('preserves an explicit minSeeders of 0 (filter disabled)', () => {
    expect(ScoringWeightsSchema.parse({ ...DEFAULT_WEIGHTS, minSeeders: 0 }).minSeeders).toBe(0);
  });
});

describe('ScoringWeightsSchema bounds', () => {
  it('accepts boundary values', () => {
    expect(
      ScoringWeightsSchema.parse({
        groupTopWeight: 0,
        groupStepDown: 0,
        batchBonus: 0,
        seederMultiplier: 0,
        trustedBonus: 0,
        remakePenalty: 0,
      }),
    ).toBeDefined();
    expect(
      ScoringWeightsSchema.parse({
        groupTopWeight: 1000,
        groupStepDown: 100,
        batchBonus: 1000,
        seederMultiplier: 100,
        trustedBonus: 1000,
        remakePenalty: -1000,
      }),
    ).toBeDefined();
  });

  it('rejects groupTopWeight > 1000', () => {
    expect(() =>
      ScoringWeightsSchema.parse({ ...DEFAULT_WEIGHTS, groupTopWeight: 1001 }),
    ).toThrow();
  });

  it('rejects negative groupStepDown', () => {
    expect(() => ScoringWeightsSchema.parse({ ...DEFAULT_WEIGHTS, groupStepDown: -1 })).toThrow();
  });

  it('rejects remakePenalty above 0', () => {
    expect(() => ScoringWeightsSchema.parse({ ...DEFAULT_WEIGHTS, remakePenalty: 1 })).toThrow();
  });

  it('rejects remakePenalty below -1000', () => {
    expect(() =>
      ScoringWeightsSchema.parse({ ...DEFAULT_WEIGHTS, remakePenalty: -1001 }),
    ).toThrow();
  });

  it('rejects non-integer values', () => {
    expect(() =>
      ScoringWeightsSchema.parse({ ...DEFAULT_WEIGHTS, seederMultiplier: 5.5 }),
    ).toThrow();
  });
});

describe('adultFilterSetting', () => {
  it('returns documented defaults when unset', async () => {
    const cfg = await adultFilterSetting.get();
    expect(cfg.enabled).toBe(true);
    expect(cfg.blockedCategories).toEqual(['4_1', '4_2', '4_3', '4_4']);
  });

  it('round-trips a save', async () => {
    await adultFilterSetting.set({
      enabled: false,
      blockedCategories: ['4_1', 'filelist-99'],
    });
    const cfg = await adultFilterSetting.get();
    expect(cfg.enabled).toBe(false);
    expect(cfg.blockedCategories).toEqual(['4_1', 'filelist-99']);
  });
});

describe('AdultFilterSchema bounds', () => {
  it('accepts an empty blockedCategories array', () => {
    expect(AdultFilterSchema.parse({ enabled: true, blockedCategories: [] })).toBeDefined();
  });

  it('rejects a blockedCategories entry > 32 chars', () => {
    expect(() =>
      AdultFilterSchema.parse({
        enabled: true,
        blockedCategories: ['a'.repeat(33)],
      }),
    ).toThrow();
  });

  it('rejects non-boolean enabled', () => {
    expect(() => AdultFilterSchema.parse({ enabled: 'yes', blockedCategories: [] })).toThrow();
  });
});
