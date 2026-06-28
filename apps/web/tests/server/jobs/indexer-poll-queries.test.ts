import { describe, it, expect } from 'vitest';
import { buildQueries } from '@/server/jobs/kinds/indexer-poll';
import type { SeriesRow } from '@/server/db/schema';
import type { IndexerConfig } from '@/server/integrations/indexers/types';

const cfg = { queryTemplate: '{title} {extra}' } as IndexerConfig;

function series(o: Partial<SeriesRow>): SeriesRow {
  return {
    titleEnglish: null,
    titleRomaji: null,
    titleNative: null,
    extraSearchTermsJson: '[]',
    ...o,
  } as SeriesRow;
}

describe('buildQueries (interactive multi-title search)', () => {
  it('builds one query per distinct title (English / romaji / native)', () => {
    expect(
      buildQueries(
        series({ titleEnglish: 'Bunny Drop', titleRomaji: 'Usagi Drop', titleNative: 'うさぎドロップ' }),
        cfg,
      ),
    ).toEqual(['Bunny Drop', 'Usagi Drop', 'うさぎドロップ']);
  });

  it('dedupes identical titles and skips empty ones', () => {
    expect(buildQueries(series({ titleEnglish: 'Same', titleRomaji: 'Same', titleNative: '  ' }), cfg)).toEqual([
      'Same',
    ]);
  });

  it('applies extra search terms to each query', () => {
    expect(
      buildQueries(series({ titleEnglish: 'X', extraSearchTermsJson: JSON.stringify(['digital']) }), cfg),
    ).toEqual(['X digital']);
  });

  it('returns [] when the series has no titles', () => {
    expect(buildQueries(series({}), cfg)).toEqual([]);
  });
});
