export type ParsedFilename = {
  volume: number | null;
  chapter: string | null;
  group: string | null;
  confidence: number;
  debug: {
    matchedPattern: string | null;
    stripped: string;
  };
};

const EXT_RE = /\.(cbz|cbr|zip|rar)$/i;
const GROUP_RE = /\[([^\]]*)\]/g;

type Pattern = { name: string; re: RegExp; kind: 'volume' | 'chapter' };
const VOLUME_PATTERNS: Pattern[] = [
  { name: 'v-short', re: /\bv(\d+)\b/i, kind: 'volume' },
  { name: 'vol', re: /\bvol\.?\s*(\d+)\b/i, kind: 'volume' },
  { name: 'volume', re: /\bvolume\s+(\d+)\b/i, kind: 'volume' },
];
const CHAPTER_PATTERNS: Pattern[] = [
  { name: 'c-short', re: /\bc(\d+(?:\.\d+)?)(?:-(\d+(?:\.\d+)?))?\b/i, kind: 'chapter' },
  { name: 'ch', re: /\bch\.?\s*(\d+(?:\.\d+)?)(?:-(\d+(?:\.\d+)?))?\b/i, kind: 'chapter' },
  { name: 'chapter', re: /\bchapter\s+(\d+(?:\.\d+)?)(?:-(\d+(?:\.\d+)?))?\b/i, kind: 'chapter' },
];

// Comic issue patterns — fills the chapter slot (comics use chapter granularity)
// Negative lookbehind avoids matching "Annual #N", "Special #N", "FCBD #N"
const ISSUE_RANGE_RE =
  /(?<!Annual\s)(?<!Special\s)(?<!FCBD\s)#\s*(\d+(?:\.\d+)?)\s*-\s*#?\s*(\d+(?:\.\d+)?)\b/;
const ISSUE_SINGLE_RE = /(?<!Annual\s)(?<!Special\s)(?<!FCBD\s)#\s*(\d+(?:\.\d+)?)\b/;

export function parseFilename(filename: string): ParsedFilename {
  const stem = filename.replace(EXT_RE, '');

  let group: string | null = null;
  const tags: string[] = [];
  for (const m of stem.matchAll(GROUP_RE)) {
    const content = m[1]?.trim();
    if (content && content.length > 0) tags.push(content);
  }
  if (tags.length > 0) group = tags[tags.length - 1] ?? null;
  // Normalize underscores to spaces before pattern matching so word boundaries work
  const stripped = stem.replace(GROUP_RE, '').replace(/_/g, ' ').trim();

  let volume: number | null = null;
  let chapter: string | null = null;
  let matched: Pattern | null = null;
  let isRangeChapter = false;

  for (const p of VOLUME_PATTERNS) {
    const m = stripped.match(p.re);
    if (m && m[1]) {
      volume = parseInt(m[1], 10);
      matched = p;
      break;
    }
  }
  if (volume === null) {
    for (const p of CHAPTER_PATTERNS) {
      const m = stripped.match(p.re);
      if (m && m[1]) {
        isRangeChapter = m[2] !== undefined;
        chapter = m[2] ? `${m[1]}-${m[2]}` : m[1];
        matched = p;
        break;
      }
    }
  }

  // Comic issue notation (#NN or #NN-NN) — only when no volume/chapter matched yet
  if (volume === null && matched === null) {
    const mr = stripped.match(ISSUE_RANGE_RE);
    if (mr && mr[1] && mr[2]) {
      chapter = `${parseInt(mr[1], 10)}-${parseInt(mr[2], 10)}`;
      matched = { name: 'issue-range', re: ISSUE_RANGE_RE, kind: 'chapter' };
      isRangeChapter = true;
    } else {
      const ms = stripped.match(ISSUE_SINGLE_RE);
      if (ms && ms[1]) {
        chapter = String(parseInt(ms[1], 10));
        matched = { name: 'issue-single', re: ISSUE_SINGLE_RE, kind: 'chapter' };
      }
    }
  }

  let confidence: number;
  if (volume !== null && group) confidence = 0.95;
  else if (volume !== null) confidence = 0.9;
  else if (chapter !== null && group && !isRangeChapter) confidence = 0.9;
  else if (chapter !== null) confidence = 0.85;
  else if (group) confidence = 0.3;
  else confidence = 0.1;

  return {
    volume,
    chapter,
    group,
    confidence,
    debug: { matchedPattern: matched?.name ?? null, stripped },
  };
}
