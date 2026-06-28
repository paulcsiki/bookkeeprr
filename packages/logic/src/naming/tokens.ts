export const KNOWN_TOKENS = [
  'series_title',
  'series_title_english',
  'series_title_romaji',
  'series_title_native',
  'series_year',
  'anilist_id',
  'volume',
  'chapter',
  'chapter_range',
  'group',
  'language',
  'ext',
  'publisher',
  'author',
  'group_path',
] as const;

export type TokenName = (typeof KNOWN_TOKENS)[number];

const SET = new Set<string>(KNOWN_TOKENS);

export function isKnownToken(name: string): name is TokenName {
  return SET.has(name);
}

const PAD_RE = /^0+$/;
// eslint-disable-next-line no-control-regex
const ILLEGAL_PATH_RE = /[<>:"/\\|?*\x00-\x1f]/g;

export function applyFormatter(value: string, formatter: string | null): string {
  if (formatter === null || formatter === '') return value;
  if (PAD_RE.test(formatter)) {
    if (!/^\d+$/.test(value)) return value;
    return value.padStart(formatter.length, '0');
  }
  if (formatter === 'lower') return value.toLowerCase();
  if (formatter === 'upper') return value.toUpperCase();
  if (formatter === 'dotted') return value.replace(/\s+/g, '.');
  if (formatter === 'sane') {
    return value
      .replace(ILLEGAL_PATH_RE, ' ')
      .replace(/[. ]+$/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return value;
}
