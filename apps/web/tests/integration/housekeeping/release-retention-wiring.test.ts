import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { housekeepingDescriptor } from '@/server/jobs/kinds/housekeeping';
import { releaseRetentionSetting } from '@/server/db/settings/release-retention';
import * as releasesDal from '@/server/db/releases';

let h: SeedHandle;
let tmpConfig: string;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  tmpConfig = mkdtempSync(join(tmpdir(), 'bk-hk-retention-cfg-'));
  process.env.BOOKKEEPRR_CONFIG_DIR = tmpConfig;
});
afterEach(() => {
  delete process.env.BOOKKEEPRR_CONFIG_DIR;
  h.cleanup();
  rmSync(tmpConfig, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('housekeeping job: release pruning', () => {
  it('uses the releaseRetentionSetting values', async () => {
    await releaseRetentionSetting.set({ keepPerSeries: 7, olderThanDays: 14 });

    const spy = vi.spyOn(releasesDal, 'pruneReleases').mockResolvedValue({ deletedCount: 0 });

    await housekeepingDescriptor.handler({}, 1);

    expect(spy).toHaveBeenCalledWith({ keepPerSeries: 7, olderThanDays: 14 });
  });

  it('uses the documented defaults when setting is unset', async () => {
    const spy = vi.spyOn(releasesDal, 'pruneReleases').mockResolvedValue({ deletedCount: 0 });

    await housekeepingDescriptor.handler({}, 1);

    expect(spy).toHaveBeenCalledWith({ keepPerSeries: 30, olderThanDays: 90 });
  });
});
