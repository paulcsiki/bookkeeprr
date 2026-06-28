import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../../integration/helpers/seed';
import { autoGrabSetting, AutoGrabSchema, DEFAULT_AUTO_GRAB } from '@/server/db/settings/auto-grab';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

describe('autoGrabSetting', () => {
  it('returns documented default when unset', async () => {
    const cfg = await autoGrabSetting.get();
    expect(cfg).toEqual(DEFAULT_AUTO_GRAB);
    expect(cfg.dryRun).toBe(false);
  });

  it('round-trips a save', async () => {
    await autoGrabSetting.set({ dryRun: true });
    const cfg = await autoGrabSetting.get();
    expect(cfg.dryRun).toBe(true);
  });
});

describe('AutoGrabSchema bounds', () => {
  it('accepts {dryRun: true}', () => {
    expect(AutoGrabSchema.parse({ dryRun: true })).toEqual({ dryRun: true });
  });

  it('accepts {dryRun: false}', () => {
    expect(AutoGrabSchema.parse({ dryRun: false })).toEqual({ dryRun: false });
  });

  it('rejects non-boolean dryRun', () => {
    expect(() => AutoGrabSchema.parse({ dryRun: 'yes' })).toThrow();
  });

  it('rejects missing dryRun', () => {
    expect(() => AutoGrabSchema.parse({})).toThrow();
  });
});
