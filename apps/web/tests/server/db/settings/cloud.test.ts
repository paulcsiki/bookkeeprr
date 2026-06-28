import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../../integration/helpers/seed';
import { cloudSettings } from '@/server/db/settings/cloud';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

describe('cloudSettings DAL', () => {
  it('returns defaults with a fresh installUuid', async () => {
    const cfg = await cloudSettings.get();
    expect(cfg.enabled).toBe(false);
    expect(cfg.cloudBaseUrl).toBe('https://cloud.bookkeeprr.io');
    expect(cfg.tenantId).toBeNull();
    expect(cfg.installUuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(cfg.accessToken).toBeNull();
  });

  it('persists the same installUuid across reads', async () => {
    const a = await cloudSettings.get();
    const b = await cloudSettings.get();
    expect(a.installUuid).toBe(b.installUuid);
  });

  it('updates only the specified fields via partial patch', async () => {
    const initial = await cloudSettings.get();
    await cloudSettings.set({ tenantId: 'tenant-abc' });
    const cfg = await cloudSettings.get();
    expect(cfg.tenantId).toBe('tenant-abc');
    expect(cfg.enabled).toBe(false);
    expect(cfg.installUuid).toBe(initial.installUuid);
  });
});
