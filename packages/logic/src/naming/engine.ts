import { applyFormatter, isKnownToken, type TokenName } from './tokens';

export type NamingContext = {
  series: {
    english?: string | null;
    romaji?: string | null;
    native?: string | null;
    year?: number | null;
    anilistId?: number | null;
    publisher?: string | null;
    author?: string | null;
    /** Root-first group-path segments, e.g. ['Engineering', 'Architecture']. */
    groupPath?: string[] | null;
  };
  release: { group?: string | null; language?: 'en' | 'jp' | null };
  target: { volume?: number; chapter?: string; chapterRange?: string };
  source: { ext: string };
};

export type ContentType = 'volume' | 'chapter' | 'batch' | 'folder';

export class NamingError extends Error {
  constructor(
    message: string,
    public position?: number,
  ) {
    super(message);
    this.name = 'NamingError';
  }
}

const FORBIDDEN: Record<ContentType, readonly TokenName[]> = {
  volume: ['chapter', 'chapter_range', 'group_path'],
  chapter: ['volume', 'chapter_range', 'group_path'],
  batch: ['volume', 'chapter', 'group_path'],
  folder: ['volume', 'chapter', 'chapter_range', 'ext', 'group'],
};

const TOKEN_RE = /\{([a-z_][a-z0-9_]*)(?::([a-z0-9]+))?\}/gi;

function resolveTokenValue(token: TokenName, ctx: NamingContext): string {
  switch (token) {
    case 'series_title': {
      return ctx.series.english ?? ctx.series.romaji ?? ctx.series.native ?? '';
    }
    case 'series_title_english':
      return ctx.series.english ?? '';
    case 'series_title_romaji':
      return ctx.series.romaji ?? '';
    case 'series_title_native':
      return ctx.series.native ?? '';
    case 'series_year':
      return ctx.series.year != null ? String(ctx.series.year) : '';
    case 'anilist_id':
      return ctx.series.anilistId != null ? String(ctx.series.anilistId) : '';
    case 'volume':
      return ctx.target.volume != null ? String(ctx.target.volume) : '';
    case 'chapter':
      return ctx.target.chapter ?? '';
    case 'chapter_range':
      return ctx.target.chapterRange ?? '';
    case 'group':
      return ctx.release.group ?? '';
    case 'language':
      return ctx.release.language ?? '';
    case 'ext':
      return ctx.source.ext;
    case 'publisher':
      return ctx.series.publisher ?? '';
    case 'author':
      return ctx.series.author ?? '';
    case 'group_path':
      return (ctx.series.groupPath ?? [])
        .map((seg) => applyFormatter(seg, 'sane'))
        .filter(Boolean)
        .join('/');
  }
}

export function render(template: string, ctx: NamingContext): string {
  let out = '';
  let lastIndex = 0;
  for (const m of template.matchAll(TOKEN_RE)) {
    out += template.slice(lastIndex, m.index);
    const tokenName = m[1] ?? '';
    const formatter = m[2] ?? null;
    if (!isKnownToken(tokenName)) {
      throw new NamingError(`unknown token '${tokenName}' at col ${m.index}`, m.index);
    }
    if (tokenName === 'group_path' && formatter === 'sane') {
      throw new NamingError(
        "formatter 'sane' cannot be applied to '{group_path}' — it would destroy path separators",
        m.index,
      );
    }
    const raw = resolveTokenValue(tokenName, ctx);
    // group_path is pre-sanitized per segment; skip the outer 'sane' pass so
    // the '/' path separators are preserved.
    const sanitized = tokenName === 'group_path' ? raw : applyFormatter(raw, 'sane');
    out += applyFormatter(sanitized, formatter);
    lastIndex = (m.index ?? 0) + m[0].length;
  }
  out += template.slice(lastIndex);
  // Collapse bracket/paren segments left empty after token substitution — e.g.
  // "[{group}]" renders "[]" when a file has no release group, and
  // "({series_year})" renders "()" when the year is unknown. Drop the empty
  // delimiters (and any adjacent run of spaces they'd leave behind) so optional
  // tokens disappear cleanly instead of emitting "[]"/"()". Tokens that DO
  // resolve keep their brackets.
  out = out
    .replace(/\s*\[\s*\]/g, '')
    .replace(/\s*\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // Collapse stray slashes left by an empty {group_path}: double-slash → single,
  // then strip leading and trailing slashes.
  out = out.replace(/\/{2,}/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  return out;
}

export type ValidateResult = { ok: true } | { ok: false; error: string; position?: number };

export function validateTemplate(template: string, contentType: ContentType): ValidateResult {
  const forbidden = new Set<string>(FORBIDDEN[contentType]);
  for (const m of template.matchAll(TOKEN_RE)) {
    const tokenName = m[1] ?? '';
    if (!isKnownToken(tokenName)) {
      return { ok: false, error: `unknown token '${tokenName}'`, position: m.index };
    }
    if (forbidden.has(tokenName)) {
      return {
        ok: false,
        error: `token '{${tokenName}}' is not allowed in ${contentType} templates`,
        position: m.index,
      };
    }
    if (tokenName === 'group_path' && (m[2] ?? null) === 'sane') {
      return {
        ok: false,
        error: "formatter 'sane' cannot be applied to '{group_path}' — it would destroy path separators",
        position: m.index,
      };
    }
  }
  return { ok: true };
}
