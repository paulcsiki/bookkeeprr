import { describe, expect, it } from 'vitest';
import { render } from '@/server/naming/engine';
import { NAMING_DEFAULTS_BY_TYPE } from '@/server/db/settings/naming';

describe('Audiobook defaults (spec §15)', () => {
  it('series_folder renders {author}/{series_title}', () => {
    expect(
      render(NAMING_DEFAULTS_BY_TYPE.audiobook.series_folder, {
        series: { english: 'Project Hail Mary', anilistId: 1, author: 'Andy Weir' },
        release: { group: null, language: 'en' },
        target: {},
        source: { ext: 'm4b' },
      }),
    ).toBe('Andy Weir/Project Hail Mary');
  });

  it('volume renders {series_title}.{ext} (no v01 suffix)', () => {
    expect(
      render(NAMING_DEFAULTS_BY_TYPE.audiobook.volume, {
        series: { english: 'Project Hail Mary', anilistId: 1, author: 'Andy Weir' },
        release: { group: null, language: 'en' },
        target: { volume: 1 },
        source: { ext: 'm4b' },
      }),
    ).toBe('Project Hail Mary.m4b');
  });

  it('mp3 extension renders correctly', () => {
    expect(
      render(NAMING_DEFAULTS_BY_TYPE.audiobook.volume, {
        series: { english: 'Project Hail Mary', anilistId: 1, author: 'Andy Weir' },
        release: { group: null, language: 'en' },
        target: { volume: 1 },
        source: { ext: 'mp3' },
      }),
    ).toBe('Project Hail Mary.mp3');
  });
});
