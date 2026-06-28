import { describe, expect, it } from 'vitest';
import { collapseForView } from '@/app/(app)/library/collapse';
import type { SeriesRow } from '@/server/db/schema';
import type { BookSeriesRow } from '@/server/db/schema';

/** Minimal SeriesRow factory — only the fields collapseForView cares about. */
function makeSeries(overrides: Partial<SeriesRow> & { id: number; titleEnglish: string; contentType: SeriesRow['contentType'] }): SeriesRow {
  return {
    titleRomaji: null,
    titleNative: null,
    description: null,
    coverUrl: null,
    status: 'finished',
    monitoring: 'none',
    rootPath: '/tmp/test',
    qualityProfileId: 1,
    groupId: null,
    malId: null,
    alId: null,
    totalVolumes: null,
    addedAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  } as SeriesRow;
}

/** Minimal BookSeriesRow factory. */
function makeBookSeries(
  id: number,
  name: string,
  contentType: BookSeriesRow['contentType'],
  memberCount = 0,
): BookSeriesRow & { memberCount: number } {
  return {
    id,
    name,
    contentType,
    description: null,
    coverUrl: null,
    totalBooks: null,
    externalId: null,
    externalIdsJson: null,
    source: 'manual',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    memberCount,
  };
}

const NL = makeSeries({ id: 10, titleEnglish: 'Northern Lights', contentType: 'ebook' });
const SK = makeSeries({ id: 11, titleEnglish: 'The Subtle Knife', contentType: 'ebook' });
const STANDALONE = makeSeries({ id: 20, titleEnglish: 'Standalone Ebook', contentType: 'ebook' });
const MANGA_SERIES = makeSeries({ id: 30, titleEnglish: 'Great Manga', contentType: 'manga' });

const HDM = makeBookSeries(1, 'His Dark Materials', 'ebook', 2);

const MEMBERSHIPS = [
  { bookSeriesId: HDM.id, seriesId: NL.id },
  { bookSeriesId: HDM.id, seriesId: SK.id },
];

describe('collapseForView', () => {
  it('empty search: collapses member titles into a single book-series card', () => {
    const { cards } = collapseForView(
      [NL, SK, STANDALONE],
      MEMBERSHIPS,
      [HDM],
      { search: '', typeFilter: 'all' },
    );

    // Should have the book-series card + standalone; NL and SK are NOT rendered individually
    const kinds = cards.map((c) => c.kind);
    expect(kinds).toContain('bookSeries');

    // STANDALONE should be rendered as a plain series card
    const seriesCards = cards.filter((c) => c.kind === 'series');
    expect(seriesCards).toHaveLength(1);
    if (seriesCards[0]!.kind === 'series') {
      expect(seriesCards[0]!.series.id).toBe(STANDALONE.id);
    }

    // Exactly one book-series card
    const bsCards = cards.filter((c) => c.kind === 'bookSeries');
    expect(bsCards).toHaveLength(1);
  });

  it('empty search: matchedTitle is undefined on book-series card', () => {
    const { cards } = collapseForView([NL, SK], MEMBERSHIPS, [HDM], { search: '', typeFilter: 'all' });
    const bsCard = cards.find((c) => c.kind === 'bookSeries');
    expect(bsCard).toBeDefined();
    if (bsCard?.kind === 'bookSeries') {
      expect(bsCard.matchedTitle).toBeUndefined();
    }
  });

  it('search for member title ("subtle") surfaces the book-series card with matchedTitle set', () => {
    const { cards } = collapseForView(
      [NL, SK, STANDALONE],
      MEMBERSHIPS,
      [HDM],
      { search: 'subtle', typeFilter: 'all' },
    );

    // STANDALONE does not match "subtle" — only the book series does via SK
    expect(cards).toHaveLength(1);
    const card = cards[0]!;
    expect(card.kind).toBe('bookSeries');
    if (card.kind === 'bookSeries') {
      expect(card.bookSeries.id).toBe(HDM.id);
      expect(card.matchedTitle).toBe('The Subtle Knife');
    }
  });

  it('search for book-series name surfaces it', () => {
    const { cards } = collapseForView(
      [NL, SK, STANDALONE],
      MEMBERSHIPS,
      [HDM],
      { search: 'dark materials', typeFilter: 'all' },
    );

    expect(cards).toHaveLength(1);
    const card = cards[0]!;
    expect(card.kind).toBe('bookSeries');
    if (card.kind === 'bookSeries') {
      // matchedTitle may or may not be set when the series name itself matches
      expect(card.bookSeries.id).toBe(HDM.id);
    }
  });

  it('search for something not in any title hides everything', () => {
    const { cards } = collapseForView(
      [NL, SK, STANDALONE],
      MEMBERSHIPS,
      [HDM],
      { search: 'zzzznotfound', typeFilter: 'all' },
    );
    expect(cards).toHaveLength(0);
  });

  it('content-type filter applies: manga filter hides ebook book-series', () => {
    const { cards } = collapseForView(
      [NL, SK, STANDALONE, MANGA_SERIES],
      MEMBERSHIPS,
      [HDM],
      { search: '', typeFilter: 'manga' },
    );

    // HDM is ebook — filtered out; MANGA_SERIES is manga — shown
    const bsCards = cards.filter((c) => c.kind === 'bookSeries');
    expect(bsCards).toHaveLength(0);
    const seriesCards = cards.filter((c) => c.kind === 'series');
    expect(seriesCards).toHaveLength(1);
    if (seriesCards[0]!.kind === 'series') {
      expect(seriesCards[0]!.series.id).toBe(MANGA_SERIES.id);
    }
  });

  it('content-type filter: ebook filter shows book-series and hides manga', () => {
    const { cards } = collapseForView(
      [NL, SK, STANDALONE, MANGA_SERIES],
      MEMBERSHIPS,
      [HDM],
      { search: '', typeFilter: 'ebook' },
    );

    const bsCards = cards.filter((c) => c.kind === 'bookSeries');
    expect(bsCards).toHaveLength(1);
    const seriesCards = cards.filter((c) => c.kind === 'series');
    // STANDALONE is ebook, MANGA_SERIES is filtered out
    expect(seriesCards.every((c) => c.kind === 'series' && c.series.contentType === 'ebook')).toBe(true);
    expect(cards.some((c) => c.kind === 'series' && c.series.id === MANGA_SERIES.id)).toBe(false);
  });

  it('a series not belonging to any book series is rendered as kind:series', () => {
    const { cards } = collapseForView(
      [STANDALONE],
      [],
      [],
      { search: '', typeFilter: 'all' },
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]!.kind).toBe('series');
    if (cards[0]!.kind === 'series') {
      expect(cards[0]!.series.id).toBe(STANDALONE.id);
    }
  });

  // ── Regression tests for C1: book-series name search (LibraryView wiring) ──
  //
  // These tests simulate what LibraryView does after the C1 fix: the FULL
  // series list (including all book-series members, NOT pre-filtered by text
  // search) is passed to collapseForView, which applies the text search itself.
  // Before the C1 fix the text search was applied first in LibraryView, which
  // stripped the member series and left the book series with no members to
  // trigger the name-match path.

  it('C1-regression: book-series name search surfaces the card when no member title matches (full list passed)', () => {
    // Query matches "His Dark Materials" (the book-series name) but does NOT
    // match "Northern Lights", "The Subtle Knife", or "Standalone Ebook".
    // The full series list is passed (no pre-text-filtering by the caller).
    const { cards } = collapseForView(
      [NL, SK, STANDALONE],
      MEMBERSHIPS,
      [HDM],
      { search: 'his dark materials', typeFilter: 'all' },
    );

    // HDM book-series card MUST appear.
    const bsCards = cards.filter((c) => c.kind === 'bookSeries');
    expect(bsCards).toHaveLength(1);
    if (bsCards[0]!.kind === 'bookSeries') {
      expect(bsCards[0]!.bookSeries.id).toBe(HDM.id);
    }

    // STANDALONE does not match the query — must NOT appear.
    const standaloneCards = cards.filter((c) => c.kind === 'series');
    expect(standaloneCards).toHaveLength(0);
  });

  it('C1-regression: standalone title search still returns the standalone card via collapseForView (full list passed)', () => {
    // Query matches "Standalone Ebook" but not the book-series name or members.
    const { cards } = collapseForView(
      [NL, SK, STANDALONE],
      MEMBERSHIPS,
      [HDM],
      { search: 'standalone', typeFilter: 'all' },
    );

    // STANDALONE must appear as a series card.
    const seriesCards = cards.filter((c) => c.kind === 'series');
    expect(seriesCards).toHaveLength(1);
    if (seriesCards[0]!.kind === 'series') {
      expect(seriesCards[0]!.series.id).toBe(STANDALONE.id);
    }

    // HDM does not match "standalone" — must NOT appear.
    const bsCards = cards.filter((c) => c.kind === 'bookSeries');
    expect(bsCards).toHaveLength(0);
  });
});
