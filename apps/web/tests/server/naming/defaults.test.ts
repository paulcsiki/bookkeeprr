import { describe, expect, it } from 'vitest';
import { render } from '@/server/naming/engine';
import { NAMING_DEFAULTS, NAMING_DEFAULTS_BY_TYPE } from '@/server/db/settings/naming';

const series = { english: 'Chainsaw Man', romaji: 'Chainsaw Man', anilistId: 105778, year: 2018 };
const release = { group: 'LH', language: 'en' as const };

describe('Phase 1 default naming examples (spec §8.2)', () => {
  it('volume default → Chainsaw Man - v14 [LH].cbz', () => {
    expect(
      render(NAMING_DEFAULTS.volume, {
        series,
        release,
        target: { volume: 14 },
        source: { ext: 'cbz' },
      }),
    ).toBe('Chainsaw Man - v14 [LH].cbz');
  });

  it('chapter default → Chainsaw Man - c142 [LH].cbz', () => {
    const ch = { english: 'Chainsaw Man', romaji: 'Chainsaw Man', anilistId: 105778, year: 2018 };
    expect(
      render(NAMING_DEFAULTS.chapter, {
        series: ch,
        release: { group: 'WSJ', language: 'en' },
        target: { chapter: '142' },
        source: { ext: 'cbz' },
      }),
    ).toBe('Chainsaw Man - c142 [WSJ].cbz');
  });

  it('batch default → Chainsaw Man - c001-012 [LH].cbz', () => {
    expect(
      render(NAMING_DEFAULTS.batch, {
        series,
        release,
        target: { chapterRange: '001-012' },
        source: { ext: 'cbz' },
      }),
    ).toBe('Chainsaw Man - c001-012 [LH].cbz');
  });
});

describe('Light novel defaults (spec §15)', () => {
  it('LN defaults render the spec §15 example', () => {
    // Note: :sane is applied per-token, so ':' in series titles is stripped.
    // The literal '/' between {author} and {series_title} in series_folder survives.
    expect(
      render(NAMING_DEFAULTS_BY_TYPE.light_novel.series_folder, {
        series: { english: 'Re Zero', anilistId: 21355, author: 'Tappei Nagatsuki' },
        release: { group: null, language: 'en' },
        target: {},
        source: { ext: 'epub' },
      }),
    ).toBe('Tappei Nagatsuki/Re Zero Light Novel');

    expect(
      render(NAMING_DEFAULTS_BY_TYPE.light_novel.volume, {
        series: { english: 'Re Zero', anilistId: 21355, author: 'Tappei Nagatsuki' },
        release: { group: 'J-Novel', language: 'en' },
        target: { volume: 1 },
        source: { ext: 'epub' },
      }),
    ).toBe('Re Zero - v01 [J-Novel].epub');
  });
});

describe('Comic defaults (spec §15)', () => {
  it('comic defaults render the spec §15 example', () => {
    expect(
      render(NAMING_DEFAULTS_BY_TYPE.comic.series_folder, {
        series: { english: 'Watchmen', anilistId: 1, year: 1986, publisher: 'DC Comics' },
        release: { group: 'LH', language: 'en' },
        target: {},
        source: { ext: 'cbr' },
      }),
    ).toBe('DC Comics/Watchmen (1986)');

    expect(
      render(NAMING_DEFAULTS_BY_TYPE.comic.chapter, {
        series: { english: 'Watchmen', anilistId: 1, year: 1986, publisher: 'DC Comics' },
        release: { group: 'Glorith-HD', language: 'en' },
        target: { chapter: '5' },
        source: { ext: 'cbr' },
      }),
    ).toBe('Watchmen #005 [Glorith-HD].cbr');
  });
});
