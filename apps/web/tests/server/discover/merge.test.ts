import { describe, it, expect } from 'vitest';
import { normalizeTitle, dedupeResults } from '@/server/discover/merge';
import type { DiscoverResult } from '@/app/api/discover/search/route';

function row(over: Partial<DiscoverResult> = {}): DiscoverResult {
  return {
    contentType: 'manga',
    sourceId: '1',
    title: 'The Vinland Saga',
    source: 'anilist',
    detail: null,
    inLib: false,
    ...over,
  };
}

describe('normalizeTitle', () => {
  it('equates titles differing only by case, whitespace, and surrounding punctuation', () => {
    expect(normalizeTitle('  The Vinland Saga!! ')).toBe(normalizeTitle('the vinland saga'));
  });

  it('collapses internal whitespace runs', () => {
    expect(normalizeTitle('the   vinland\tsaga')).toBe('the vinland saga');
  });

  it('strips leading punctuation', () => {
    expect(normalizeTitle('"Naruto"')).toBe(normalizeTitle('Naruto'));
  });
});

describe('dedupeResults', () => {
  it('collapses two same-type same-normalized-title rows, keeping the richer one', () => {
    const lean = row({ sourceId: 'a', title: 'The Vinland Saga!!', sources: { anilist: 1 } });
    const rich = row({
      sourceId: 'b',
      title: 'the vinland saga',
      year: 2005,
      author: 'Makoto Yukimura',
      coverUrl: 'https://x/cover.jpg',
      sources: { anilist: 1, mangadex: 'md-123' },
    });
    const out = dedupeResults([lean, rich]);
    expect(out).toHaveLength(1);
    expect(out[0]!.sources?.mangadex).toBe('md-123');
    expect(out[0]!.author).toBe('Makoto Yukimura');
  });

  it('keeps the first occurrence position (stable order)', () => {
    const a = row({ title: 'Alpha', sources: { anilist: 1 } });
    const b = row({ title: 'Beta' });
    const aDup = row({ title: 'alpha', year: 2020, sources: { anilist: 1, mangadex: 'm' } });
    const out = dedupeResults([a, b, aDup]);
    expect(out.map((r) => r.title.toLowerCase())).toEqual(['alpha', 'beta']);
    // richer alpha won the merge
    expect(out[0]!.sources?.mangadex).toBe('m');
  });

  it('does NOT collapse different content types with the same title', () => {
    const manga = row({ contentType: 'manga', title: 'Berserk' });
    const ebook = row({ contentType: 'ebook', title: 'Berserk' });
    const out = dedupeResults([manga, ebook]);
    expect(out).toHaveLength(2);
  });
});
