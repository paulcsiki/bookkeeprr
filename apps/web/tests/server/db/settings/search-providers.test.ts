import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../../integration/helpers/seed';
import {
  DEFAULT_SEARCH_PROVIDERS,
  searchProvidersSetting,
} from '@/server/db/settings/search-providers';
import { getDb } from '@/server/db/client';
import { settings } from '@/server/db/schema';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

describe('searchProvidersSetting', () => {
  it('defaults to all providers enabled when unset', async () => {
    const cfg = await searchProvidersSetting.get();
    expect(cfg).toEqual(DEFAULT_SEARCH_PROVIDERS);
    expect(Object.values(cfg).every((v) => v === true)).toBe(true);
  });

  it('round-trips a save with some providers disabled', async () => {
    await searchProvidersSetting.set({
      ...DEFAULT_SEARCH_PROVIDERS,
      novelupdates: false,
      mal: false,
    });
    const cfg = await searchProvidersSetting.get();
    expect(cfg.novelupdates).toBe(false);
    expect(cfg.mal).toBe(false);
    expect(cfg.anilist).toBe(true);
  });

  it('merges a stored value that is missing a key — the missing provider defaults on', async () => {
    // Simulate a value persisted before `audnex` existed: write raw JSON missing it.
    const db = getDb();
    await db.insert(settings).values({
      key: 'search.providers',
      valueJson: JSON.stringify({
        anilist: false,
        mal: true,
        mangadex: true,
        comicvine: true,
        openlibrary: true,
        novelupdates: true,
        // audnex intentionally absent
      }),
    });
    const cfg = await searchProvidersSetting.get();
    expect(cfg.audnex).toBe(true); // missing key → default (enabled)
    expect(cfg.anilist).toBe(false); // stored value preserved
  });

  it('tolerates a malformed stored value by falling back to all-enabled defaults', async () => {
    const db = getDb();
    await db.insert(settings).values({
      key: 'search.providers',
      valueJson: JSON.stringify({ anilist: 'nope', extra: 1 }),
    });
    const cfg = await searchProvidersSetting.get();
    expect(cfg).toEqual(DEFAULT_SEARCH_PROVIDERS);
  });
});
