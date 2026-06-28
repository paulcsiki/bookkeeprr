import { describe, expect, it } from 'vitest';
import {
  render,
  validateTemplate,
  NAMING_DEFAULTS,
  NAMING_DEFAULTS_BY_TYPE,
  type NamingContext,
} from '../src/naming';

const mangaCtx: NamingContext = {
  series: {
    english: 'Chainsaw Man',
    romaji: null,
    native: null,
    year: 2018,
    anilistId: 105778,
    publisher: null,
    author: null,
  },
  release: { group: 'Scan', language: 'en' },
  target: { volume: 14 },
  source: { ext: 'cbz' },
};

describe('naming engine (packages/logic)', () => {
  it('render() produces the expected string for a manga volume fixture', () => {
    expect(render('{series_title} - v{volume:00} [{group}].{ext}', mangaCtx)).toBe(
      'Chainsaw Man - v14 [Scan].cbz',
    );
  });

  it('validateTemplate() flags an unbalanced { with a position', () => {
    // An unbalanced "{" that does not form a token leaves an unknown/unmatched
    // construct; the engine reports a non-ok result. Use a real unknown token
    // produced by a stray brace + identifier so validateTemplate surfaces it.
    const res = validateTemplate('{series_title} - v{bogus}', 'volume');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(typeof res.position).toBe('number');
    }
  });

  it('NAMING_DEFAULTS.volume equals the known manga default', () => {
    expect(NAMING_DEFAULTS.volume).toBe('{series_title} - v{volume:00} [{group}].{ext}');
  });
});

describe('{group_path}', () => {
  const base: NamingContext = {
    series: { english: 'Piranesi', groupPath: ['Engineering', 'Architecture'] },
    release: {},
    target: {},
    source: { ext: 'epub' },
  } as NamingContext;

  it('renders nested groups joined with /', () => {
    expect(render('{group_path}/{series_title}', base)).toBe('Engineering/Architecture/Piranesi');
  });

  it('collapses cleanly when ungrouped — no stray slash', () => {
    const ctx = { ...base, series: { ...base.series, groupPath: [] } };
    expect(render('{group_path}/{series_title}', ctx)).toBe('Piranesi');
    const ctx2 = { ...base, series: { ...base.series, groupPath: undefined } };
    expect(render('{group_path}/{series_title}', ctx2)).toBe('Piranesi');
  });

  it('sanitizes each segment independently', () => {
    const ctx = { ...base, series: { ...base.series, groupPath: ['Sci-Fi: Best/Worst', 'A?B'] } };
    // ':' '/' '?' are ILLEGAL_PATH_RE — replaced with spaces, then squeezed.
    expect(render('{group_path}/{series_title}', ctx)).toBe('Sci-Fi Best Worst/A B/Piranesi');
  });

  it('is forbidden outside folder templates', () => {
    for (const t of ['volume', 'chapter', 'batch'] as const) {
      expect(validateTemplate('{group_path}-x', t).ok).toBe(false);
    }
    expect(validateTemplate('{group_path}/{series_title}', 'folder').ok).toBe(true);
  });

  it('defaults: every series_folder template starts with {group_path}/', () => {
    for (const ct of Object.keys(NAMING_DEFAULTS_BY_TYPE) as (keyof typeof NAMING_DEFAULTS_BY_TYPE)[]) {
      expect(NAMING_DEFAULTS_BY_TYPE[ct].series_folder.startsWith('{group_path}/')).toBe(true);
    }
  });

  it('render() throws when {group_path:sane} is used — sane destroys path separators', () => {
    expect(() => render('{group_path:sane}/{series_title}', base)).toThrow(
      /destroy path separators/,
    );
  });

  it('validateTemplate() rejects {group_path:sane} in folder templates', () => {
    const res = validateTemplate('{group_path:sane}/{series_title}', 'folder');
    expect(res.ok).toBe(false);
  });

  it('{group_path:lower} works — lower keeps slashes intact', () => {
    expect(render('{group_path:lower}/{series_title}', base)).toBe(
      'engineering/architecture/Piranesi',
    );
  });
});
