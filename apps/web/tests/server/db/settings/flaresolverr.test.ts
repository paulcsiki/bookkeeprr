import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../../integration/helpers/seed';
import {
  flaresolverrSetting,
  isFlaresolverrConfigured,
} from '@/server/db/settings/flaresolverr';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

describe('flaresolverrSetting', () => {
  it('returns the default (empty url) when unset', async () => {
    const cfg = await flaresolverrSetting.get();
    expect(cfg.url).toBe('');
  });

  it('round-trips a save', async () => {
    await flaresolverrSetting.set({ url: 'http://flaresolverr:8191' });
    const cfg = await flaresolverrSetting.get();
    expect(cfg.url).toBe('http://flaresolverr:8191');
  });
});

describe('isFlaresolverrConfigured', () => {
  it('is false for empty / whitespace url', () => {
    expect(isFlaresolverrConfigured({ url: '' })).toBe(false);
    expect(isFlaresolverrConfigured({ url: '   ' })).toBe(false);
  });

  it('is true for a non-empty url', () => {
    expect(isFlaresolverrConfigured({ url: 'http://flaresolverr:8191' })).toBe(true);
  });
});
