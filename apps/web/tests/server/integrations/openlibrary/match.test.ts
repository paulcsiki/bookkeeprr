import { describe, expect, it } from 'vitest';
import { matchVolumeEdition } from '@/server/integrations/openlibrary/match';
import type { OpenLibrarySearchHit } from '@/server/integrations/openlibrary/client';

function hit(over: Partial<OpenLibrarySearchHit>): OpenLibrarySearchHit {
  return {
    olid: 'OL1W',
    title: 'Untitled',
    author: null,
    firstPublishYear: null,
    isbn: null,
    coverUrl: null,
    ...over,
  };
}

describe('matchVolumeEdition', () => {
  it('picks the correct hit for volume N and returns its fields', () => {
    const hits = [
      hit({
        olid: 'OL3V',
        title: 'Berserk, Vol. 3',
        firstPublishYear: 2004,
        isbn: '9781591162094',
        coverUrl: 'https://covers.example/3-L.jpg',
      }),
    ];
    const r = matchVolumeEdition(hits, { seriesTitles: ['Berserk'], volumeNumber: 3 });
    expect(r).toEqual({
      coverUrl: 'https://covers.example/3-L.jpg',
      year: 2004,
      isbn: '9781591162094',
      olid: 'OL3V',
    });
  });

  it('does not return a Vol. 7 hit when asking for volume 3', () => {
    const hits = [hit({ title: 'Berserk, Vol. 7', coverUrl: 'https://covers.example/7.jpg' })];
    expect(matchVolumeEdition(hits, { seriesTitles: ['Berserk'], volumeNumber: 3 })).toBeNull();
  });

  it('matches zero-padded "Vol. 03" against volume 3', () => {
    const hits = [hit({ olid: 'OLpad', title: 'Berserk, Vol. 03', firstPublishYear: 2004 })];
    const r = matchVolumeEdition(hits, { seriesTitles: ['Berserk'], volumeNumber: 3 });
    expect(r?.olid).toBe('OLpad');
    expect(r?.year).toBe(2004);
  });

  it('rejects a Japanese edition flagged with [In Japanese]', () => {
    const hits = [
      hit({ title: 'Usagi Drop Vol.7 (Bunny Drop) [In Japanese]', coverUrl: 'https://c/7.jpg' }),
    ];
    expect(matchVolumeEdition(hits, { seriesTitles: ['Usagi Drop'], volumeNumber: 7 })).toBeNull();
  });

  it('rejects a hit whose title contains CJK characters', () => {
    const hits = [hit({ title: 'うさぎドロップ Vol. 7', coverUrl: 'https://c/7.jpg' })];
    expect(matchVolumeEdition(hits, { seriesTitles: ['うさぎドロップ'], volumeNumber: 7 })).toBeNull();
  });

  it('rejects a hit whose title does not contain the series title', () => {
    const hits = [hit({ title: 'Some Other Manga, Vol. 3' })];
    expect(matchVolumeEdition(hits, { seriesTitles: ['Berserk'], volumeNumber: 3 })).toBeNull();
  });

  it('prefers a covered valid hit over a coverless one for the same volume', () => {
    const hits = [
      hit({ olid: 'OLnocover', title: 'Berserk, Vol. 3', coverUrl: null }),
      hit({ olid: 'OLcover', title: 'Berserk Volume 3', coverUrl: 'https://c/3.jpg' }),
    ];
    const r = matchVolumeEdition(hits, { seriesTitles: ['Berserk'], volumeNumber: 3 });
    expect(r?.olid).toBe('OLcover');
    expect(r?.coverUrl).toBe('https://c/3.jpg');
  });

  it('returns the first coverless valid hit when none have covers', () => {
    const hits = [
      hit({ olid: 'OLfirst', title: 'Berserk, Vol. 3', firstPublishYear: 2004 }),
      hit({ olid: 'OLsecond', title: 'Berserk, Volume 3' }),
    ];
    const r = matchVolumeEdition(hits, { seriesTitles: ['Berserk'], volumeNumber: 3 });
    expect(r?.olid).toBe('OLfirst');
    expect(r?.coverUrl).toBeNull();
    expect(r?.year).toBe(2004);
  });

  it('rejects an omnibus / range edition for a single volume', () => {
    const omnibus = [
      hit({ title: 'Bunny Drop Vol. 1-3 Omnibus', coverUrl: 'https://c/omni.jpg' }),
      hit({ title: 'Fruits Basket Collector’s Edition, Vol. 1 (3-in-1)', coverUrl: 'https://c/3in1.jpg' }),
    ];
    expect(matchVolumeEdition([omnibus[0]!], { seriesTitles: ['Bunny Drop'], volumeNumber: 1 })).toBeNull();
    expect(
      matchVolumeEdition([omnibus[1]!], { seriesTitles: ['Fruits Basket'], volumeNumber: 1 }),
    ).toBeNull();
  });

  it('rejects series titles shorter than 3 chars to avoid loose matches', () => {
    const hits = [hit({ title: 'Tear Drop, Vol. 3', coverUrl: 'https://c/3.jpg' })];
    // Series literally named "Air" must not match "...drop..." etc.; here "AI" is too short.
    expect(matchVolumeEdition(hits, { seriesTitles: ['AI'], volumeNumber: 3 })).toBeNull();
  });

  it('returns null for an empty list', () => {
    expect(matchVolumeEdition([], { seriesTitles: ['Berserk'], volumeNumber: 3 })).toBeNull();
  });

  it('returns null when nothing qualifies', () => {
    const hits = [hit({ title: 'Berserk, Vol. 1' }), hit({ title: 'Naruto, Vol. 3' })];
    expect(matchVolumeEdition(hits, { seriesTitles: ['Berserk'], volumeNumber: 3 })).toBeNull();
  });

  it('matches "volume", "vol." and "vol" markers', () => {
    const variants = ['Berserk volume 3', 'Berserk vol. 3', 'Berserk vol 3'];
    for (const title of variants) {
      const r = matchVolumeEdition([hit({ title })], {
        seriesTitles: ['Berserk'],
        volumeNumber: 3,
      });
      expect(r, title).not.toBeNull();
    }
  });

  it('ignores empty/whitespace series titles but uses a valid one', () => {
    const hits = [hit({ olid: 'OLok', title: 'Berserk, Vol. 3' })];
    const r = matchVolumeEdition(hits, { seriesTitles: ['', '   ', 'Berserk'], volumeNumber: 3 });
    expect(r?.olid).toBe('OLok');
  });

  it('returns null when only empty series titles are provided', () => {
    const hits = [hit({ title: 'Berserk, Vol. 3' })];
    expect(matchVolumeEdition(hits, { seriesTitles: ['', '  '], volumeNumber: 3 })).toBeNull();
  });
});
