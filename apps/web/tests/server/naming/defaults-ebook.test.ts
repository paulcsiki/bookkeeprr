import { describe, expect, it } from 'vitest';
import { render } from '@/server/naming/engine';
import { NAMING_DEFAULTS_BY_TYPE } from '@/server/db/settings/naming';

describe('Ebook defaults (spec §13)', () => {
  it('series_folder renders {author}/{series_title}', () => {
    expect(
      render(NAMING_DEFAULTS_BY_TYPE.ebook.series_folder, {
        series: { english: 'Project Hail Mary', anilistId: 1, author: 'Andy Weir' },
        release: { group: null, language: 'en' },
        target: {},
        source: { ext: 'epub' },
      }),
    ).toBe('Andy Weir/Project Hail Mary');
  });

  it('volume renders {series_title} - v{volume:00} [{group}].{ext}', () => {
    expect(
      render(NAMING_DEFAULTS_BY_TYPE.ebook.volume, {
        series: { english: 'Project Hail Mary', anilistId: 1, author: 'Andy Weir' },
        release: { group: 'EBOOK', language: 'en' },
        target: { volume: 1 },
        source: { ext: 'epub' },
      }),
    ).toBe('Project Hail Mary - v01 [EBOOK].epub');
  });
});
