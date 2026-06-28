import { describe, expect, it } from 'vitest';
import { pickVolumeEdition, type Edition } from '@/server/integrations/googlebooks/derive';

function ed(over: Partial<Edition>): Edition {
  return {
    id: 'defaultQBAJ',
    title: 'Solo Leveling, Vol. 2 (novel)',
    publisher: 'Yen Press',
    description: 'Some description',
    pageCount: 320,
    language: 'en',
    coverUrl: 'https://books.google.com/c?id=defaultQBAJ',
    viewability: 'PARTIAL',
    isbn: null,
    ...over,
  };
}

describe('pickVolumeEdition', () => {
  it('returns a real-cover QBAJ edition matching the series title and volume', () => {
    const edition = ed({
      id: 'v2QBAJ',
      title: 'Solo Leveling, Vol. 2 (novel)',
      coverUrl: 'https://books.google.com/c?id=v2QBAJ',
      viewability: 'PARTIAL',
    });
    const result = pickVolumeEdition([edition], 'Solo Leveling', 2);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('v2QBAJ');
  });

  it('returns null for a catalog-only edition (NO_PAGES, non-QBAJ id)', () => {
    const catalogEd = ed({
      id: '7gMczgEACAAJ',
      title: 'Solo Leveling, Vol. 2 (novel)',
      coverUrl: 'https://placeholder.google.com/not-available',
      viewability: 'NO_PAGES',
    });
    const result = pickVolumeEdition([catalogEd], 'Solo Leveling', 2);
    expect(result).toBeNull();
  });

  it('returns null for a wrong-volume edition', () => {
    const wrongVol = ed({
      id: 'v3QBAJ',
      title: 'Solo Leveling, Vol. 3 (novel)',
      viewability: 'PARTIAL',
    });
    const result = pickVolumeEdition([wrongVol], 'Solo Leveling', 2);
    expect(result).toBeNull();
  });

  it('returns null for a comic/manga edition even with real cover', () => {
    const comicEd = ed({
      id: 'comicQBAJ',
      title: 'Solo Leveling, Vol. 2 (comic)',
      viewability: 'PARTIAL',
    });
    const result = pickVolumeEdition([comicEd], 'Solo Leveling', 2);
    expect(result).toBeNull();
  });

  it('returns null for a manga edition even with real cover', () => {
    const mangaEd = ed({
      id: 'mangaQBAJ',
      title: 'Solo Leveling, Vol. 2 (manga)',
      viewability: 'PARTIAL',
    });
    const result = pickVolumeEdition([mangaEd], 'Solo Leveling', 2);
    expect(result).toBeNull();
  });

  it('prefers an edition with a description over one without', () => {
    const withDesc = ed({
      id: 'v2withDescQBAJ',
      title: 'Solo Leveling, Vol. 2 (novel)',
      description: 'Great description',
      viewability: 'PARTIAL',
    });
    const noDesc = ed({
      id: 'v2noDescQBAJ',
      title: 'Solo Leveling, Vol. 2 (novel)',
      description: null,
      viewability: 'PARTIAL',
    });
    const result = pickVolumeEdition([noDesc, withDesc], 'Solo Leveling', 2);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('v2withDescQBAJ');
  });

  it('returns null when editions list is empty', () => {
    expect(pickVolumeEdition([], 'Solo Leveling', 2)).toBeNull();
  });

  it('rejects a wrong-series edition (e.g. Naruto vol 2)', () => {
    const wrongSeries = ed({
      id: 'naruQBAJ',
      title: 'Naruto, Vol. 2 (novel)',
      viewability: 'PARTIAL',
    });
    const result = pickVolumeEdition([wrongSeries], 'Solo Leveling', 2);
    expect(result).toBeNull();
  });

  it('rejects a non-English edition', () => {
    const jaEd = ed({
      id: 'jaQBAJ',
      title: 'Solo Leveling, Vol. 2 (novel)',
      language: 'ja',
      viewability: 'PARTIAL',
    });
    const result = pickVolumeEdition([jaEd], 'Solo Leveling', 2);
    expect(result).toBeNull();
  });
});
