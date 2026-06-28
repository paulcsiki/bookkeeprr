import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { flaresolverrSetting } from '@/server/db/settings/flaresolverr';

// Mock the FlareSolverr client so we can count how often a host is solved.
const getCfClearance = vi.fn();
vi.mock('@/server/integrations/flaresolverr/client', () => ({
  getCfClearance: (...args: unknown[]) => getCfClearance(...args),
  FlaresolverrError: class FlaresolverrError extends Error {},
}));

import {
  clearanceForHost,
  invalidateClearance,
  _resetClearanceCache,
} from '@/server/images/cf-clearance';

const HOST = 'cdn.novelupdates.com';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  _resetClearanceCache();
  getCfClearance.mockReset();
});
afterEach(() => {
  h.cleanup();
  vi.restoreAllMocks();
});

describe('clearanceForHost', () => {
  it('returns null when FlareSolverr is not configured (no solve attempted)', async () => {
    const out = await clearanceForHost(HOST);
    expect(out).toBeNull();
    expect(getCfClearance).not.toHaveBeenCalled();
  });

  it('solves the host through FlareSolverr and returns the clearance', async () => {
    await flaresolverrSetting.set({ url: 'http://flaresolverr:8191' });
    getCfClearance.mockResolvedValue({ cookie: 'cf_clearance=X', userAgent: 'UA' });

    const out = await clearanceForHost(HOST);
    expect(out).toEqual({ cookie: 'cf_clearance=X', userAgent: 'UA' });
    expect(getCfClearance).toHaveBeenCalledWith('http://flaresolverr:8191', `https://${HOST}/`);
  });

  it('caches within the TTL — a second call does NOT re-solve', async () => {
    await flaresolverrSetting.set({ url: 'http://flaresolverr:8191' });
    getCfClearance.mockResolvedValue({ cookie: 'cf_clearance=X', userAgent: 'UA' });

    await clearanceForHost(HOST);
    await clearanceForHost(HOST);
    expect(getCfClearance).toHaveBeenCalledTimes(1);
  });

  it('re-solves after the entry is invalidated', async () => {
    await flaresolverrSetting.set({ url: 'http://flaresolverr:8191' });
    getCfClearance.mockResolvedValue({ cookie: 'cf_clearance=X', userAgent: 'UA' });

    await clearanceForHost(HOST);
    invalidateClearance(HOST);
    await clearanceForHost(HOST);
    expect(getCfClearance).toHaveBeenCalledTimes(2);
  });

  it('returns null and does not cache when the solve yields no clearance', async () => {
    await flaresolverrSetting.set({ url: 'http://flaresolverr:8191' });
    getCfClearance.mockResolvedValue(null);

    expect(await clearanceForHost(HOST)).toBeNull();
    // Not cached: a second call retries the solve.
    expect(await clearanceForHost(HOST)).toBeNull();
    expect(getCfClearance).toHaveBeenCalledTimes(2);
  });

  it('returns null when the solve throws (FlareSolverr down)', async () => {
    await flaresolverrSetting.set({ url: 'http://flaresolverr:8191' });
    getCfClearance.mockRejectedValue(new Error('ECONNREFUSED'));

    expect(await clearanceForHost(HOST)).toBeNull();
  });
});
