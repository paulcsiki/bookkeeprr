import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { seedDb, type SeedHandle } from '../../../integration/helpers/seed';
import { visibilityRetentionSetting } from '@/server/db/settings/visibility-retention';

describe('visibilityRetentionSetting', () => {
  let h: SeedHandle;
  beforeEach(async () => {
    h = await seedDb({ skipDefaultSeries: true });
  });
  afterEach(() => h.cleanup());

  it('returns defaults when no row stored', async () => {
    const cfg = await visibilityRetentionSetting.get();
    expect(cfg.auditRetentionDays).toBe(30);
    expect(cfg.logRetentionDays).toBe(7);
  });

  it('round-trips a configured value', async () => {
    await visibilityRetentionSetting.set({ auditRetentionDays: 90, logRetentionDays: 14 });
    const cfg = await visibilityRetentionSetting.get();
    expect(cfg.auditRetentionDays).toBe(90);
    expect(cfg.logRetentionDays).toBe(14);
  });
});
