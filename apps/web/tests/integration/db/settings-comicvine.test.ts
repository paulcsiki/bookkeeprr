import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { comicVineApiKeySetting, isComicVineConfigured } from '@/server/db/settings/comicvine';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb();
});
afterEach(() => h.cleanup());

describe('comicVineApiKeySetting', () => {
  it('defaults to empty string', async () => {
    expect(await comicVineApiKeySetting.get()).toBe('');
  });

  it('roundtrips a key', async () => {
    await comicVineApiKeySetting.set('abc123');
    expect(await comicVineApiKeySetting.get()).toBe('abc123');
  });
});

describe('isComicVineConfigured', () => {
  it('returns false for empty string', () => {
    expect(isComicVineConfigured('')).toBe(false);
  });
  it('returns true for non-empty', () => {
    expect(isComicVineConfigured('any-key')).toBe(true);
  });
});
