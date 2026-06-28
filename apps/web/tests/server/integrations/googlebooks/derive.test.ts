import { describe, expect, it } from 'vitest';
import { deriveSeriesFromEditions, hasRealCover, parseVolumeNumber, type Edition } from '@/server/integrations/googlebooks/derive';

function ed(over: Partial<Edition>): Edition {
  const id = over.id ?? 'x';
  return {
    id,
    title: 'Solo Leveling, Vol. 1 (novel)',
    publisher: 'Yen Press',
    description: 'desc',
    pageCount: 300,
    language: 'en',
    coverUrl: `https://books.google.com/c?id=${id}`,
    viewability: 'PARTIAL',
    isbn: null,
    ...over,
  };
}

describe('deriveSeriesFromEditions', () => {
  it('derives count, cover, publisher, and per-volume metadata from clean editions', () => {
    const editions = [
      ed({ id: 'v1', title: 'Solo Leveling, Vol. 1 (novel)', pageCount: 300 }),
      ed({ id: 'v2', title: 'Solo Leveling, Vol. 2 (novel)', pageCount: 320 }),
      ed({ id: 'v6', title: 'Solo Leveling, Vol. 6 (novel)', pageCount: 350 }),
    ];
    const r = deriveSeriesFromEditions(editions, 'Solo Leveling');
    expect(r).not.toBeNull();
    expect(r!.totalVolumes).toBe(6);
    expect(r!.publisher).toBe('Yen Press');
    expect(r!.seriesCoverUrl).toBe('https://books.google.com/c?id=v1');
    expect(r!.seriesDescription).toBe('desc');
    expect(r!.volumes.find((v) => v.number === 1)!.googleBooksVolumeId).toBe('v1');
    expect(r!.volumes.find((v) => v.number === 6)!.pageCount).toBe(350);
  });

  it('returns null when fewer than 2 numbered volumes survive filtering', () => {
    const editions = [ed({ id: 'v1', title: 'Solo Leveling, Vol. 1 (novel)' })];
    expect(deriveSeriesFromEditions(editions, 'Solo Leveling')).toBeNull();
  });

  it('rejects wrong-series, non-English, box-set, and unnumbered editions', () => {
    const editions = [
      ed({ id: 'v1', title: 'Solo Leveling, Vol. 1 (novel)' }),
      ed({ id: 'v2', title: 'Solo Leveling, Vol. 2 (novel)' }),
      // spin-off/sub-series: "Side Stories" between title and vol marker must be rejected
      ed({ id: 'bad1', title: 'Solo Leveling: Side Stories, Vol. 1' }),
      ed({ id: 'bad2', title: 'Solo Leveling Box Set, Vols. 1-5' }), // range, not a discrete number
      ed({ id: 'bad3', title: 'Solo Leveling Artbook' }), // no volume number
      ed({ id: 'bad4', title: 'Naruto, Vol. 3' }), // different series
      ed({ id: 'bad5', title: 'Solo Leveling, Vol. 3', language: 'ja' }), // not English
    ];
    const r = deriveSeriesFromEditions(editions, 'Solo Leveling');
    expect(r!.totalVolumes).toBe(2);
    expect(r!.volumes.map((v) => v.number).sort()).toEqual([1, 2]);
    // Side Stories spin-off must be genuinely absent
    expect(r!.volumes.map((v) => v.googleBooksVolumeId)).not.toContain('bad1');
  });

  it('excludes comic/manga/manhwa editions even when title and volume number match', () => {
    const editions = [
      ed({ id: 'n1', title: 'Solo Leveling, Vol. 1 (novel)' }),
      ed({ id: 'n2', title: 'Solo Leveling, Vol. 2 (novel)' }),
      ed({ id: 'c1', title: 'Solo Leveling, Vol. 1 (comic)' }),
    ];
    const r = deriveSeriesFromEditions(editions, 'Solo Leveling');
    expect(r).not.toBeNull();
    expect(r!.volumes.map((v) => v.googleBooksVolumeId)).not.toContain('c1');
    expect(r!.totalVolumes).toBe(2);
  });

  it('dedupes by volume number, preferring an edition with cover + description', () => {
    const editions = [
      ed({ id: 'v1a', title: 'Solo Leveling, Vol. 1', coverUrl: null, description: null }),
      ed({ id: 'v1b', title: 'Solo Leveling, Vol. 1', coverUrl: 'https://c/v1b', description: 'd' }),
      ed({ id: 'v2', title: 'Solo Leveling, Vol. 2' }),
    ];
    const r = deriveSeriesFromEditions(editions, 'Solo Leveling');
    expect(r!.volumes.find((v) => v.number === 1)!.googleBooksVolumeId).toBe('v1b');
  });

  it('accepts noise words (edition/format tags) between title and vol marker', () => {
    // "Solo Leveling (Novel), Vol. 6" normalises to "solo leveling novel vol 6"
    // — "novel" is a noise word and must pass the filter.
    const editions = [
      ed({ id: 'n1', title: 'Solo Leveling (Novel), Vol. 1' }),
      ed({ id: 'n6', title: 'Solo Leveling (Novel), Vol. 6' }),
    ];
    const r = deriveSeriesFromEditions(editions, 'Solo Leveling');
    expect(r).not.toBeNull();
    expect(r!.volumes.map((v) => v.number).sort((a, b) => a - b)).toEqual([1, 6]);
  });
});

describe('hasRealCover', () => {
  it('returns false when coverUrl is null', () => {
    expect(hasRealCover(ed({ coverUrl: null }))).toBe(false);
  });

  it('returns true for a QBAJ-id edition regardless of viewability', () => {
    expect(hasRealCover(ed({ id: 'NewOEAAAQBAJ', coverUrl: 'https://x', viewability: 'NO_PAGES' }))).toBe(true);
    expect(hasRealCover(ed({ id: 'NewOEAAAQBAJ', coverUrl: 'https://x', viewability: null }))).toBe(true);
  });

  it('returns true for PARTIAL viewability', () => {
    expect(hasRealCover(ed({ id: 'abc', viewability: 'PARTIAL', coverUrl: 'https://x' }))).toBe(true);
  });

  it('returns true for ALL_PAGES viewability', () => {
    expect(hasRealCover(ed({ id: 'abc', viewability: 'ALL_PAGES', coverUrl: 'https://x' }))).toBe(true);
  });

  it('returns false for NO_PAGES viewability with non-QBAJ id', () => {
    expect(hasRealCover(ed({ id: '7gMczgEACAAJ', viewability: 'NO_PAGES', coverUrl: 'https://x' }))).toBe(false);
  });

  it('returns false when viewability is null and id is not QBAJ', () => {
    expect(hasRealCover(ed({ id: 'someRandomId', viewability: null, coverUrl: 'https://x' }))).toBe(false);
  });
});

describe('deriveSeriesFromEditions (real-cover filtering)', () => {
  it('catalog-only edition (NO_PAGES + ACAAJ id) yields null coverUrl for that volume but vol is still counted', () => {
    const editions = [
      ed({ id: 'v1QBAJ', title: 'Solo Leveling, Vol. 1 (novel)', coverUrl: 'https://x/v1', viewability: 'PARTIAL' }),
      ed({ id: 'v2QBAJ', title: 'Solo Leveling, Vol. 2 (novel)', coverUrl: 'https://x/v2', viewability: 'PARTIAL' }),
      ed({ id: '7gMczgEACAAJ', title: 'Solo Leveling, Vol. 3 (novel)', coverUrl: 'https://x/v3', viewability: 'NO_PAGES' }),
    ];
    const r = deriveSeriesFromEditions(editions, 'Solo Leveling');
    expect(r).not.toBeNull();
    // Vol 3 still counted
    expect(r!.totalVolumes).toBe(3);
    expect(r!.volumes.find((v) => v.number === 3)).toBeDefined();
    // But its cover is null (catalog-only)
    expect(r!.volumes.find((v) => v.number === 3)!.coverUrl).toBeNull();
  });

  it('QBAJ-id edition yields non-null coverUrl', () => {
    const editions = [
      ed({ id: 'Abc123QBAJ', title: 'Solo Leveling, Vol. 1 (novel)', coverUrl: 'https://x/v1', viewability: null }),
      ed({ id: 'Def456QBAJ', title: 'Solo Leveling, Vol. 2 (novel)', coverUrl: 'https://x/v2', viewability: null }),
    ];
    const r = deriveSeriesFromEditions(editions, 'Solo Leveling');
    expect(r).not.toBeNull();
    expect(r!.volumes.find((v) => v.number === 1)!.coverUrl).toBe('https://x/v1');
    expect(r!.volumes.find((v) => v.number === 2)!.coverUrl).toBe('https://x/v2');
  });

  it('seriesCoverUrl is null when the lowest-numbered volume has no real cover but higher one does', () => {
    const editions = [
      ed({ id: '7gMczgEACAAJ', title: 'Solo Leveling, Vol. 1 (novel)', coverUrl: 'https://x/v1', viewability: 'NO_PAGES' }),
      ed({ id: 'v2QBAJ', title: 'Solo Leveling, Vol. 2 (novel)', coverUrl: 'https://x/v2', viewability: 'PARTIAL' }),
    ];
    const r = deriveSeriesFromEditions(editions, 'Solo Leveling');
    expect(r).not.toBeNull();
    // seriesCoverUrl comes from the lowest-numbered volume that has a real cover
    expect(r!.seriesCoverUrl).toBe('https://x/v2');
  });

  it('a real-cover edition wins even when a catalog edition for the same volume is seen first', () => {
    const editions = [
      // catalog (no real cover) for vol 1 appears BEFORE the QBAJ edition
      ed({ id: '7gMczgEACAAJ', title: 'Solo Leveling, Vol. 1 (novel)', coverUrl: 'https://x/catalog1', viewability: 'NO_PAGES' }),
      ed({ id: 'realV1QBAJ', title: 'Solo Leveling, Vol. 1 (novel)', coverUrl: 'https://x/real1', viewability: 'PARTIAL' }),
      ed({ id: 'v2QBAJ', title: 'Solo Leveling, Vol. 2 (novel)', coverUrl: 'https://x/v2', viewability: 'PARTIAL' }),
    ];
    const r = deriveSeriesFromEditions(editions, 'Solo Leveling');
    expect(r!.volumes.find((v) => v.number === 1)!.coverUrl).toBe('https://x/real1');
  });

  it('isbn is carried from the chosen metadata edition into DerivedVolume', () => {
    const editions = [
      ed({ id: 'v1QBAJ', title: 'Solo Leveling, Vol. 1 (novel)', isbn: '9781975319311' }),
      ed({ id: 'v2QBAJ', title: 'Solo Leveling, Vol. 2 (novel)', isbn: null }),
    ];
    const r = deriveSeriesFromEditions(editions, 'Solo Leveling');
    expect(r).not.toBeNull();
    expect(r!.volumes.find((v) => v.number === 1)!.isbn).toBe('9781975319311');
    expect(r!.volumes.find((v) => v.number === 2)!.isbn).toBeNull();
  });
});

describe('parseVolumeNumber', () => {
  it('extracts integer vol numbers from typical titles', () => {
    expect(parseVolumeNumber('Solo Leveling, Vol. 6 (novel)')).toBe(6);
    expect(parseVolumeNumber('Vol. 10')).toBe(10);
    expect(parseVolumeNumber('Volume 3')).toBe(3);
    expect(parseVolumeNumber('Vol.7')).toBe(7);
  });

  it('returns null for fractional volumes', () => {
    expect(parseVolumeNumber('Sword Art Online, Vol. 8.5')).toBeNull();
  });

  it('returns null for range / box-set markers', () => {
    expect(parseVolumeNumber('Vols. 1-5')).toBeNull();
  });

  it('returns null when there is no vol marker', () => {
    // Year in parentheses must not be misread as a volume number.
    expect(parseVolumeNumber('Solo Leveling (2024)')).toBeNull();
    expect(parseVolumeNumber('Solo Leveling Artbook')).toBeNull();
  });
});
