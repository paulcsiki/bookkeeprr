export type ParsedRelease = {
  cleanTitle: string;
  targetKind: 'volume' | 'chapter' | 'batch';
  targetLow: number | null;
  targetHigh: number | null;
  group: string | null;
  language: 'en' | 'jp';
  isBatch: boolean;
  confidence: number;
  contentTypeHint: 'comic' | 'prose' | 'audio' | null;
  debug: { matched: string | null; stripped: string };
};

const LEADING_GROUP_RE = /^\s*\[([^\]]+)\]\s*/;
const ALL_BRACKETS_RE = /\[[^\]]*\]/g;
const PARENS_RE = /\(([^)]*)\)/g;

const VOL_RANGE_RE = /\b(?:v|vol\.?|volumes?)\s*(\d+)\s*-\s*v?(\d+)\b/i;
const VOL_SINGLE_RE = /\b(?:v|vol\.?|volume)\s*(\d+)\b/i;
const CH_RANGE_RE = /\b(?:c|ch\.?|chapters?)\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\b/i;
const CH_SINGLE_RE = /\b(?:c|ch\.?|chapter)\s*(\d+(?:\.\d+)?)\b/i;

// Japanese counter for volume: 第N巻
const JP_VOL_RE = /第\s*(\d+)\s*巻/;

const BATCH_MARKER_RE = /\b(batch|complete|collection|trilogy|omnibus|anthology|box\s?set)\b/i;

// Comic issue patterns — fills the chapter slot (comics use chapter granularity)
// Negative lookbehind avoids matching "Annual #N", "Special #N", "FCBD #N"
const ISSUE_RANGE_RE =
  /(?<!Annual\s)(?<!Special\s)(?<!FCBD\s)#\s*(\d+(?:\.\d+)?)\s*-\s*#?\s*(\d+(?:\.\d+)?)\b/;
const ISSUE_SINGLE_RE = /(?<!Annual\s)(?<!Special\s)(?<!FCBD\s)#\s*(\d+(?:\.\d+)?)\b/;

// CJK ranges: Hiragana, Katakana, CJK Unified Ideographs
const CJK_RE = /[぀-ゟ゠-ヿ一-鿿]/;
const RAW_TOKEN_RE = /\b(raw|japanese)\b/i;

// Content-type hint: check ORIGINAL title before any stripping. Includes file
// formats so audiobooks (m4b/mp3/…) and ebooks (epub/pdf/…) are distinguishable
// even when the title carries no "novel"/"audiobook" word.
const COMIC_HINT_RE = /\b(manga|manhwa|manhua|comic|webtoon|cbz|cbr)\b/i;
const AUDIO_HINT_RE = /\b(audio\s?books?|m4b|m4a|mp3|flac|aac|opus|audible|unabridged|abridged)\b/i;
// Note: no 'pdf' — comics also ship as PDF, so it would wrongly reject a PDF
// manga scan from a manga series. epub/mobi/azw/ebook are unambiguously text.
const PROSE_HINT_RE = /\b(light\s+novel|web\s+novel|novel|ln|epub|mobi|azw3?|ebook)\b/i;

export function parseReleaseTitle(title: string): ParsedRelease {
  // Group: leading [Bracket] only
  let group: string | null = null;
  const gm = title.match(LEADING_GROUP_RE);
  if (gm && gm[1]) group = gm[1].trim();

  // Build cleanTitle: strip ALL [brackets] and (parens). Year and quality tags are inside parens.
  let cleanTitle = title.replace(ALL_BRACKETS_RE, ' ').replace(PARENS_RE, ' ').trim();
  cleanTitle = cleanTitle.replace(/\s+/g, ' ');

  // For batch detection, keep (parens) — "(Complete)" / "(Batch)" usually live
  // there — but drop [group] brackets so a group name can't false-positive.
  const batchHaystack = title.replace(ALL_BRACKETS_RE, ' ');

  // Language heuristic — check ORIGINAL title (CJK might be inside brackets too)
  const language: 'en' | 'jp' = CJK_RE.test(title) || RAW_TOKEN_RE.test(title) ? 'jp' : 'en';

  // Content-type hint — check ORIGINAL title. Order matters: comic wins first,
  // then audio (an "...Novel... Audiobook" is audio), then prose/text. This keeps
  // an audiobook from matching an ebook series and vice-versa.
  const contentTypeHint: 'comic' | 'prose' | 'audio' | null = COMIC_HINT_RE.test(title)
    ? 'comic'
    : AUDIO_HINT_RE.test(title)
      ? 'audio'
      : PROSE_HINT_RE.test(title)
        ? 'prose'
        : null;

  // Pattern cascade
  let targetKind: 'volume' | 'chapter' | 'batch' = 'chapter';
  let targetLow: number | null = null;
  let targetHigh: number | null = null;
  let isBatch = false;
  let matched: string | null = null;

  // 1. Volume range
  let m = cleanTitle.match(VOL_RANGE_RE);
  if (m && m[1] && m[2]) {
    targetKind = 'batch';
    targetLow = parseInt(m[1], 10);
    targetHigh = parseInt(m[2], 10);
    isBatch = true;
    matched = 'vol-range';
  }

  // 2. Single volume
  if (!matched) {
    m = cleanTitle.match(VOL_SINGLE_RE);
    if (m && m[1]) {
      targetKind = 'volume';
      targetLow = parseInt(m[1], 10);
      targetHigh = targetLow;
      matched = 'vol-single';
    }
  }

  // 2b. Japanese volume counter
  if (!matched) {
    m = title.match(JP_VOL_RE);
    if (m && m[1]) {
      targetKind = 'volume';
      targetLow = parseInt(m[1], 10);
      targetHigh = targetLow;
      matched = 'jp-vol';
    }
  }

  // 3. Chapter range
  if (!matched) {
    m = cleanTitle.match(CH_RANGE_RE);
    if (m && m[1] && m[2]) {
      targetKind = 'chapter';
      targetLow = parseFloat(m[1]);
      targetHigh = parseFloat(m[2]);
      isBatch = targetHigh - targetLow >= 1;
      matched = 'ch-range';
    }
  }

  // 4. Single chapter
  if (!matched) {
    m = cleanTitle.match(CH_SINGLE_RE);
    if (m && m[1]) {
      targetKind = 'chapter';
      targetLow = parseFloat(m[1]);
      targetHigh = targetLow;
      matched = 'ch-single';
    }
  }

  // 5. Comic issue range (#NN-NN) — fills chapter slot
  if (!matched) {
    m = cleanTitle.match(ISSUE_RANGE_RE);
    if (m && m[1] && m[2]) {
      targetKind = 'chapter';
      targetLow = parseFloat(m[1]);
      targetHigh = parseFloat(m[2]);
      isBatch = targetHigh - targetLow >= 1;
      matched = 'issue-range';
    }
  }

  // 6. Comic single issue (#NN) — fills chapter slot
  if (!matched) {
    m = cleanTitle.match(ISSUE_SINGLE_RE);
    if (m && m[1]) {
      targetKind = 'chapter';
      targetLow = parseFloat(m[1]);
      targetHigh = targetLow;
      matched = 'issue-single';
    }
  }

  // 7. Explicit batch marker with no numbers — only if nothing matched
  if (!matched && BATCH_MARKER_RE.test(batchHaystack)) {
    targetKind = 'batch';
    isBatch = true;
    matched = 'batch-marker';
  }

  // Single-volume / chapter releases with "Complete" should also flag as batch
  if (
    matched &&
    matched !== 'vol-range' &&
    matched !== 'batch-marker' &&
    BATCH_MARKER_RE.test(batchHaystack)
  ) {
    isBatch = true;
  }

  // Confidence
  let confidence: number;
  if (matched === 'vol-single' || matched === 'ch-single' || matched === 'jp-vol') {
    confidence = group ? 0.95 : 0.85;
  } else if (matched === 'vol-range' || matched === 'ch-range') {
    confidence = 0.9;
  } else if (matched === 'batch-marker') {
    confidence = 0.6;
  } else {
    confidence = 0.1;
  }

  return {
    cleanTitle,
    targetKind,
    targetLow,
    targetHigh,
    group,
    language,
    isBatch,
    confidence,
    contentTypeHint,
    debug: { matched, stripped: cleanTitle },
  };
}

/**
 * Reconcile a unit-less parse with a known series granularity.
 *
 * `parseReleaseTitle` is series-agnostic, so a complete publisher pack whose
 * volume numbers live only in the files — e.g. "Solo Leveling (Novel) [Yen
 * Press]" — decodes no unit and falls back to the default `chapter` kind. Once
 * we know the series is volume-based, relabel that fallback as a volume `batch`
 * so it's matched, scored, and displayed as a whole-series volume grab rather
 * than a phantom chapter release.
 *
 * Only the default fallback (`debug.matched === null`) is touched; a release
 * with a concretely parsed unit keeps exactly what the parser decoded. The
 * batch carries no range (the title has none), so auto-grab still ignores it —
 * `decideGrabs` only acts on releases with a concrete range — and it surfaces
 * as a force-grabbable batch in interactive search.
 */
export function refineForSeries(
  parsed: ParsedRelease,
  series: { granularity: 'volume' | 'chapter'; totalVolumes: number | null },
): ParsedRelease {
  if (parsed.debug.matched !== null) return parsed;
  if (series.granularity !== 'volume') return parsed;
  // Whole-series volume grab. When we know the published count, give it a
  // concrete 1..N range so auto-grab can treat it as covering the series;
  // otherwise leave it range-less (force-grab only).
  const hasCount = series.totalVolumes != null && series.totalVolumes > 0;
  return {
    ...parsed,
    targetKind: 'batch',
    isBatch: true,
    targetLow: hasCount ? 1 : null,
    targetHigh: hasCount ? series.totalVolumes : null,
  };
}
