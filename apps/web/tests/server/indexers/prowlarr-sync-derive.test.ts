import { describe, expect, it } from 'vitest';
import { deriveContentTypeCategories } from '@/server/indexers/prowlarr-sync';

describe('deriveContentTypeCategories', () => {
  it('maps a books indexer', () => {
    expect(deriveContentTypeCategories([7000, 7020, 3030])).toEqual({
      ebook: '7020', light_novel: '7020', audiobook: '3030',
    });
  });
  it('maps a comics indexer', () => {
    expect(deriveContentTypeCategories([7000, 7030])).toEqual({ comic: '7030', manga: '7030' });
  });
  it('returns {} when no known category', () => {
    expect(deriveContentTypeCategories([5000, 5070])).toEqual({});
  });
});
