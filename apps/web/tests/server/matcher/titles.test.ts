import { describe, expect, it } from 'vitest';
import { titleMatches } from '@/server/matcher/titles';
import { parseReleaseTitle } from '@/server/parser/release';
import type { SeriesRow } from '@/server/db/schema';

function fakeSeries(over: Partial<SeriesRow>): SeriesRow {
  return {
    id: 1,
    anilistId: 1,
    mangadexId: null,
    titleEnglish: null,
    titleRomaji: null,
    titleNative: null,
    status: 'releasing',
    coverUrl: null,
    description: null,
    totalVolumes: null,
    totalChapters: null,
    rootPath: '/x',
    monitoring: 'all',
    granularity: 'volume',
    qualityProfileId: 1,
    extraSearchTermsJson: '[]',
    addedAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as SeriesRow;
}

describe('titleMatches', () => {
  it('matches when English-title tokens equal the release core tokens', () => {
    const series = fakeSeries({ titleEnglish: 'Chainsaw Man' });
    expect(titleMatches(parseReleaseTitle('Chainsaw Man v01 (2024)'), series)).toBe(true);
  });

  it('matches against romaji when english is null', () => {
    const series = fakeSeries({ titleEnglish: null, titleRomaji: 'Berserk' });
    expect(titleMatches(parseReleaseTitle('Berserk v40'), series)).toBe(true);
  });

  it('Berserk series does NOT match Berserk-of-Gluttony release (M29 fix)', () => {
    const series = fakeSeries({ titleEnglish: 'Berserk' });
    expect(titleMatches(parseReleaseTitle('Berserk of Gluttony v01'), series)).toBe(false);
  });

  it('Berserk-of-Gluttony series does NOT match Berserk release', () => {
    const series = fakeSeries({ titleEnglish: 'Berserk of Gluttony' });
    expect(titleMatches(parseReleaseTitle('Berserk v01'), series)).toBe(false);
  });

  it('Berserk series matches Berserk Deluxe release (qualifier stripped)', () => {
    const series = fakeSeries({ titleEnglish: 'Berserk' });
    expect(titleMatches(parseReleaseTitle('Berserk Deluxe v01'), series)).toBe(true);
  });

  it('Berserk series matches Berserk Omnibus release (qualifier stripped)', () => {
    const series = fakeSeries({ titleEnglish: 'Berserk' });
    expect(titleMatches(parseReleaseTitle('Berserk Omnibus v01'), series)).toBe(true);
  });

  it('extra search terms can also match', () => {
    const series = fakeSeries({
      titleEnglish: 'Some Common Name',
      extraSearchTermsJson: JSON.stringify(['unique slug']),
    });
    expect(titleMatches(parseReleaseTitle('unique slug v01'), series)).toBe(true);
  });

  it('falls back to null when no title or extra terms exist', () => {
    const series = fakeSeries({});
    expect(titleMatches(parseReleaseTitle('anything v01'), series)).toBe(false);
  });

  it('handles diacritics on both sides', () => {
    const series = fakeSeries({ titleRomaji: 'Naïve' });
    expect(titleMatches(parseReleaseTitle('naive v01'), series)).toBe(true);
  });

  it('matches a scene ebook release that embeds the author (title + author)', () => {
    const series = fakeSeries({ titleEnglish: 'Atomic Habits', author: 'James Clear' });
    expect(titleMatches(parseReleaseTitle('Atomic.Habits.James.Clear'), series)).toBe(true);
    expect(titleMatches(parseReleaseTitle('Atomic.Habits.James.Clear.Retail.EPUB'), series)).toBe(
      true,
    );
  });

  it('does not match a same-author different-title book', () => {
    const series = fakeSeries({ titleEnglish: 'Atomic Habits', author: 'James Clear' });
    expect(titleMatches(parseReleaseTitle('Some.Other.Book.James.Clear'), series)).toBe(false);
  });

  it('ebook: matches a release carrying the full subtitle + author (containment)', () => {
    const series = fakeSeries({
      titleEnglish: 'Atomic Habits',
      author: 'James Clear',
      contentType: 'ebook',
    });
    expect(
      titleMatches(
        parseReleaseTitle(
          'Atomic.Habits.An.Easy.&.Proven.Way.to.Build.Good.Habits.&.Break.Bad.Ones.by.James.Clear',
        ),
        series,
      ),
    ).toBe(true);
    expect(titleMatches(parseReleaseTitle('Atomic Habits by James Clear EPUB'), series)).toBe(true);
  });

  it('ebook: requires the author when known (guards same-title other-author)', () => {
    const series = fakeSeries({
      titleEnglish: 'Atomic Habits',
      author: 'James Clear',
      contentType: 'ebook',
    });
    expect(
      titleMatches(parseReleaseTitle('Atomic Habits An Easy Proven Way to Build Good Habits'), series),
    ).toBe(false);
    expect(titleMatches(parseReleaseTitle('Atomic Habits by Someone Else EPUB'), series)).toBe(false);
  });

  it('ebook: falls back to title containment when no author is known', () => {
    const series = fakeSeries({ titleEnglish: 'Atomic Habits', contentType: 'ebook' });
    expect(titleMatches(parseReleaseTitle('Atomic Habits by James Clear EPUB'), series)).toBe(true);
  });

  it('audiobook: containment applies (subtitle/format tolerated)', () => {
    const series = fakeSeries({
      titleEnglish: 'Atomic Habits',
      author: 'James Clear',
      contentType: 'audiobook',
    });
    expect(
      titleMatches(parseReleaseTitle('Atomic Habits - James Clear (Unabridged) [Audiobook]'), series),
    ).toBe(true);
  });

  it('audiobook: matches a release that drops the author (narrator-led name)', () => {
    const series = fakeSeries({
      titleEnglish: 'The Fellowship of the Ring',
      author: 'J.R.R. Tolkien',
      contentType: 'audiobook',
    });
    // Release prefixed by the parent series name ("The Lord of the Rings") rather
    // than the book title: prefix-anchoring correctly rejects this — the book title
    // does NOT lead the release. A user wanting this release should add it as an
    // extra search term on the series.
    expect(
      titleMatches(
        parseReleaseTitle('The Lord of the Rings - The Fellowship of the Ring (Unabridged)'),
        series,
      ),
    ).toBe(false);
    expect(
      titleMatches(parseReleaseTitle('The Fellowship of the Ring [Audiobook] Andy Serkis'), series),
    ).toBe(true);
  });

  it('audiobook: parenthetical collection name in the series title is stripped', () => {
    const series = fakeSeries({
      titleEnglish: 'The Fellowship of the Ring (Lord of the Rings)',
      author: 'J.R.R. Tolkien',
      contentType: 'audiobook',
    });
    // Release need not also contain "lord rings" — the parenthetical is optional.
    expect(
      titleMatches(parseReleaseTitle('The Fellowship of the Ring (Unabridged)'), series),
    ).toBe(true);
  });

  it('ebook: still requires the author even when the title has a parenthetical', () => {
    const series = fakeSeries({
      titleEnglish: 'The Fellowship of the Ring (Lord of the Rings)',
      author: 'J.R.R. Tolkien',
      contentType: 'ebook',
    });
    // ebook keeps the author gate — a release omitting the author must not match.
    expect(
      titleMatches(parseReleaseTitle('The Fellowship of the Ring (Unabridged)'), series),
    ).toBe(false);
  });

  it('manga keeps strict equality (containment does not leak to manga)', () => {
    const series = fakeSeries({ titleEnglish: 'Naruto', contentType: 'manga' });
    expect(titleMatches(parseReleaseTitle('Naruto Gaiden v01'), series)).toBe(false);
  });
});

function ebookSeries(over: Partial<SeriesRow>): SeriesRow {
  return {
    id: 1, contentType: 'ebook', titleEnglish: null, titleRomaji: null, titleNative: null,
    anilistId: null, malId: null, comicvineId: null, openlibraryId: null, isbn: null, asin: null,
    publisher: null, startYear: null, pageCount: null, runtimeMinutes: null, author: null,
    narrator: null, mangadexId: null, novelUpdatesSlug: null, novelUpdatesId: null,
    googleBooksVolumeId: null, googleBooksQuery: null, status: 'finished', coverUrl: null,
    description: null, totalVolumes: 1, totalChapters: null, rootPath: '/x', monitoring: 'all',
    granularity: 'volume', qualityProfileId: 1, groupId: null, extraSearchTermsJson: '[]',
    addedAt: new Date(0), updatedAt: new Date(0), ...over,
  } as SeriesRow;
}
const m = (release: string, s: SeriesRow) => titleMatches(parseReleaseTitle(release), s);

describe('titleMatches — book prefix anchoring', () => {
  const grey = ebookSeries({ titleEnglish: 'Grey', author: 'E. L. James' });
  const darker = ebookSeries({ titleEnglish: 'Darker', author: 'E. L. James' });
  const fsGrey = ebookSeries({ titleEnglish: 'Fifty Shades of Grey', author: 'E. L. James' });

  it('rejects a longer different-book title that merely contains the series title', () => {
    expect(m('Fifty Shades of Grey Trilogy by E. L. James EPUB', grey)).toBe(false);
    expect(m('Fifty Shades Darker - E. L. James ePub', darker)).toBe(false);
  });
  it('matches the actual book (title is the leading phrase)', () => {
    expect(m('Grey by E. L. James (EPUB)', grey)).toBe(true);
    expect(m('E. L. James - Grey [EPUB]', grey)).toBe(true); // leading author run dropped
    expect(m('Fifty Shades of Grey by E. L. James EPUB', fsGrey)).toBe(true);
  });
  it('still matches a subtitle after the title', () => {
    const atomic = ebookSeries({ titleEnglish: 'Atomic Habits', author: 'James Clear' });
    expect(m('Atomic Habits An Easy & Proven Way by James Clear EPUB', atomic)).toBe(true);
  });
  it('matches an alias via extra search terms (containment)', () => {
    const nl = ebookSeries({ titleEnglish: 'Northern Lights', author: 'Philip Pullman',
      extraSearchTermsJson: JSON.stringify(['The Golden Compass']) });
    expect(m('The Golden Compass by Philip Pullman EPUB', nl)).toBe(true);
  });
});
