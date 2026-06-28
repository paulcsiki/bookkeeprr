import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../../integration/helpers/seed';
import { apiKeySetting, generateApiKey, isApiKeyEnabled } from '@/server/db/settings/api-key';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

describe('apiKeySetting', () => {
  it('returns null defaults when unset', async () => {
    const cfg = await apiKeySetting.get();
    expect(cfg.key).toBeNull();
    expect(cfg.createdAt).toBeNull();
    expect(isApiKeyEnabled(cfg)).toBe(false);
  });

  it('round-trips a generated key', async () => {
    const key = generateApiKey();
    const now = new Date().toISOString();
    await apiKeySetting.set({ key, createdAt: now });
    const cfg = await apiKeySetting.get();
    expect(cfg.key).toBe(key);
    expect(cfg.createdAt).toBe(now);
    expect(isApiKeyEnabled(cfg)).toBe(true);
  });

  it('disables when key is cleared back to null', async () => {
    await apiKeySetting.set({ key: 'something', createdAt: '2026-05-24T00:00:00Z' });
    await apiKeySetting.set({ key: null, createdAt: null });
    const cfg = await apiKeySetting.get();
    expect(isApiKeyEnabled(cfg)).toBe(false);
  });
});

describe('generateApiKey', () => {
  it('returns a base64url string of stable length', () => {
    const k = generateApiKey();
    expect(k).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(k.length).toBeGreaterThanOrEqual(43);
  });
  it('returns distinct values across calls', () => {
    expect(generateApiKey()).not.toBe(generateApiKey());
  });
});
