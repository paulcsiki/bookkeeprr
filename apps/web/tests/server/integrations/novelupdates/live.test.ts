import { describe, expect, it } from 'vitest';
import {
  searchNovelUpdates,
  getSeriesBySlug,
  fetchChapterFeed,
  __resetBucketForTests,
} from '@/server/integrations/novelupdates/client';

// Gated live HTTP suite. Skipped by default; opt-in via RUN_LIVE_TESTS=1.
// CI never sets this. Run locally to catch novelupdates.com HTML drift.
// Establishes the precedent for AniList/ComicVine/OpenLibrary/Audnex later.
const live = process.env.RUN_LIVE_TESTS === '1' ? describe : describe.skip;

const CANARY_SLUG = 'mushoku-tensei';

live('novelupdates live HTTP (gated by RUN_LIVE_TESTS=1)', () => {
  it('searchNovelUpdates returns the canary series among hits', async () => {
    __resetBucketForTests();
    const hits = await searchNovelUpdates('Mushoku Tensei');
    expect(hits.length).toBeGreaterThan(0);
    // Structural invariant: the canary slug should appear somewhere in
    // the results. Tolerates ranking drift over time.
    const found = hits.some((h) => h.slug === CANARY_SLUG);
    expect(found).toBe(true);
  }, 30_000);

  it('getSeriesBySlug returns a populated series detail for the canary', async () => {
    __resetBucketForTests();
    const detail = await getSeriesBySlug(CANARY_SLUG);
    expect(detail.title.length).toBeGreaterThan(0);
    expect(detail.numericId).not.toBeNull();
    expect(detail.numericId).toBeGreaterThan(0);
    expect(detail.aliases.length).toBeGreaterThan(0);
  }, 30_000);

  it('fetchChapterFeed returns at least one entry for the canary', async () => {
    __resetBucketForTests();
    // First fetch the numeric id; the RSS feed is keyed by it, not the slug.
    const detail = await getSeriesBySlug(CANARY_SLUG);
    if (detail.numericId === null) {
      throw new Error('canary series is missing a numericId');
    }
    const feed = await fetchChapterFeed(detail.numericId);
    expect(feed.length).toBeGreaterThan(0);
  }, 30_000);
});
