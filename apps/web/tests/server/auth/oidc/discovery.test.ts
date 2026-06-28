import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as oidc from 'openid-client';
import { getDiscovery, __resetDiscoveryCacheForTests } from '@/server/auth/oidc/discovery';

vi.mock('openid-client', () => ({
  discovery: vi.fn(),
}));

describe('OIDC discovery cache', () => {
  beforeEach(() => {
    __resetDiscoveryCacheForTests();
    vi.mocked(oidc.discovery).mockReset();
  });

  it('caches discovery result per (issuer, clientId) pair', async () => {
    const spy = vi.mocked(oidc.discovery);
    // @ts-expect-error — test stub doesn't need full Configuration shape
    spy.mockResolvedValue({ serverMetadata: () => ({ issuer: 'https://x' }) });
    const a = await getDiscovery('https://x', 'cid', 'sec');
    const b = await getDiscovery('https://x', 'cid', 'sec');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it('different clientId is a different cache entry', async () => {
    const spy = vi.mocked(oidc.discovery);
    // @ts-expect-error — test stub doesn't need full Configuration shape
    spy.mockResolvedValue({ serverMetadata: () => ({}) });
    await getDiscovery('https://x', 'cid-1', 'sec');
    await getDiscovery('https://x', 'cid-2', 'sec');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('explicit cache reset forces re-discovery', async () => {
    const spy = vi.mocked(oidc.discovery);
    // @ts-expect-error — test stub doesn't need full Configuration shape
    spy.mockResolvedValue({ serverMetadata: () => ({}) });
    await getDiscovery('https://x', 'cid', 'sec');
    __resetDiscoveryCacheForTests();
    await getDiscovery('https://x', 'cid', 'sec');
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
