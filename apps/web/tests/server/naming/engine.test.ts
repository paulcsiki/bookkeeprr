import { describe, expect, it } from 'vitest';
import { render, validateTemplate, type NamingContext } from '@/server/naming/engine';

function ctx(over: Partial<NamingContext> = {}): NamingContext {
  return {
    series: { english: 'Chainsaw Man', romaji: 'Chainsaw Man', anilistId: 105778, year: 2018 },
    release: { group: 'LH', language: 'en' },
    target: { volume: 14 },
    source: { ext: 'cbz' },
    ...over,
  };
}

describe('render', () => {
  it('renders the spec default volume template', () => {
    expect(render('{series_title} - v{volume:00} [{group}].{ext}', ctx())).toBe(
      'Chainsaw Man - v14 [LH].cbz',
    );
  });

  it('renders the chapter template', () => {
    const out = render(
      '{series_title} - c{chapter:000} [{group}].{ext}',
      ctx({ target: { chapter: '142' } }),
    );
    expect(out).toBe('Chainsaw Man - c142 [LH].cbz');
  });

  it('renders the batch range template', () => {
    const out = render(
      '{series_title} - c{chapter_range} [{group}].{ext}',
      ctx({ target: { chapterRange: '001-012' } }),
    );
    expect(out).toBe('Chainsaw Man - c001-012 [LH].cbz');
  });

  it('falls back series_title_english → romaji → native', () => {
    expect(
      render(
        '{series_title}',
        ctx({ series: { english: null, romaji: 'Berserk', native: null, anilistId: 1 } }),
      ),
    ).toBe('Berserk');
  });

  it('applies :sane auto at the very end (path separators stripped)', () => {
    const out = render(
      '{series_title}.{ext}',
      ctx({ series: { english: 'Bad/Title', anilistId: 1 } }),
    );
    expect(out).not.toContain('/');
  });

  it('throws on unknown token', () => {
    expect(() => render('{nope}', ctx())).toThrow(/unknown token/);
  });

  it('renders missing optional target field as empty', () => {
    const out = render('{group}', ctx({ release: { group: null, language: 'en' } }));
    expect(out).toBe('');
  });

  it('missing series_year resolves empty', () => {
    const out = render('{series_year}', ctx({ series: { english: 'X', anilistId: 1 } }));
    expect(out).toBe('');
  });

  it('collapses empty [group] brackets when a file has no release group', () => {
    const out = render(
      '{series_title} - v{volume:00} [{group}].{ext}',
      ctx({ release: { group: null, language: 'en' }, target: { volume: 1 } }),
    );
    expect(out).not.toContain('[]');
    expect(out).toBe('Chainsaw Man - v01.cbz');
  });

  it('keeps [group] brackets when a release group is present', () => {
    const out = render(
      '{series_title} - v{volume:00} [{group}].{ext}',
      ctx({ release: { group: 'LH', language: 'en' }, target: { volume: 1 } }),
    );
    expect(out).toBe('Chainsaw Man - v01 [LH].cbz');
  });

  it('collapses an empty (year) paren segment', () => {
    const out = render(
      '{series_title} ({series_year})',
      ctx({ series: { english: 'Chainsaw Man', anilistId: 1 } }),
    );
    expect(out).toBe('Chainsaw Man');
  });

  it('chapter token preserves 42.5 / 42a', () => {
    expect(render('{chapter}', ctx({ target: { chapter: '42.5' } }))).toBe('42.5');
    expect(render('{chapter}', ctx({ target: { chapter: '42a' } }))).toBe('42a');
  });

  it('renders {publisher} from context', () => {
    expect(
      render(
        '{publisher}',
        ctx({ series: { english: 'X', anilistId: 1, publisher: 'DC Comics' } }),
      ),
    ).toBe('DC Comics');
  });

  it('{publisher} resolves to empty when null', () => {
    expect(
      render('{publisher}', ctx({ series: { english: 'X', anilistId: 1, publisher: null } })),
    ).toBe('');
  });

  it('renders {author} from context', () => {
    expect(
      render(
        '{author}',
        ctx({ series: { english: 'X', anilistId: 1, author: 'Tappei Nagatsuki' } }),
      ),
    ).toBe('Tappei Nagatsuki');
  });

  it('{author} resolves to empty when null', () => {
    expect(render('{author}', ctx({ series: { english: 'X', anilistId: 1, author: null } }))).toBe(
      '',
    );
  });
});

describe('validateTemplate', () => {
  it('volume template cannot reference {chapter}', () => {
    const r = validateTemplate('{series_title} - c{chapter}.{ext}', 'volume');
    expect(r.ok).toBe(false);
  });
  it('chapter template cannot reference {volume}', () => {
    expect(validateTemplate('{series_title} - v{volume:00}.{ext}', 'chapter').ok).toBe(false);
  });
  it('batch template cannot reference {volume} or {chapter}', () => {
    expect(validateTemplate('{volume}', 'batch').ok).toBe(false);
    expect(validateTemplate('{chapter}', 'batch').ok).toBe(false);
    expect(validateTemplate('{chapter_range}', 'batch').ok).toBe(true);
  });
  it('folder template cannot reference {volume}, {chapter}, {chapter_range}, {ext}, {group}', () => {
    expect(validateTemplate('{volume}', 'folder').ok).toBe(false);
    expect(validateTemplate('{chapter}', 'folder').ok).toBe(false);
    expect(validateTemplate('{chapter_range}', 'folder').ok).toBe(false);
    expect(validateTemplate('{ext}', 'folder').ok).toBe(false);
    expect(validateTemplate('{group}', 'folder').ok).toBe(false);
    expect(validateTemplate('{series_title}', 'folder').ok).toBe(true);
  });
  it('rejects unknown tokens with position', () => {
    const r = validateTemplate('foo {bogus}', 'volume');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/unknown token/);
      expect(r.position).toBeGreaterThanOrEqual(0);
    }
  });
  it('accepts the spec defaults', () => {
    expect(validateTemplate('{series_title} - v{volume:00} [{group}].{ext}', 'volume').ok).toBe(
      true,
    );
    expect(validateTemplate('{series_title} - c{chapter:000} [{group}].{ext}', 'chapter').ok).toBe(
      true,
    );
    expect(validateTemplate('{series_title} - c{chapter_range} [{group}].{ext}', 'batch').ok).toBe(
      true,
    );
    expect(validateTemplate('{series_title}', 'folder').ok).toBe(true);
  });
});
