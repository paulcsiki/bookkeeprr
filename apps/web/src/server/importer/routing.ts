import { parseFilename } from '@/server/parser/filename';
import type { ReleaseRow } from '@/server/db/schema';
import type { QbtFile } from '@/server/integrations/qbittorrent';
import type { ContentType } from '@/server/content-type';
import { isOuterArchive, unpackArchive } from './extract';

export type Granularity = 'volume' | 'chapter';

export type Routed = {
  file: QbtFile;
  targetKind: 'volume' | 'chapter';
  targetNumber: number;
};

export type SkippedFile = {
  sourceName: string;
  reason: 'unmatched';
};

export type RouteResult = {
  routed: Routed[];
  skipped: SkippedFile[];
};

const ARCHIVE_EXT_RE = /\.(cbz|cbr|zip|rar|7z|epub|mobi|pdf|azw3|m4b|m4a|mp3|aac|flac|ogg)$/i;

const AUDIO_EXT_RE = /\.(m4b|m4a|mp3|aac|flac|ogg)$/i;

const EBOOK_EXT_RE = /\.(epub|mobi|pdf|azw3?)$/i;

function basename(p: string): string {
  const i = p.lastIndexOf('/');
  return i >= 0 ? p.slice(i + 1) : p;
}

function isArchive(name: string): boolean {
  return ARCHIVE_EXT_RE.test(name);
}

export function routeFiles(
  release: ReleaseRow,
  granularity: Granularity,
  files: QbtFile[],
  contentType?: ContentType,
): RouteResult {
  // Audiobook short-circuit: every audio file routes to volume 1.
  if (contentType === 'audiobook') {
    const routed: Routed[] = [];
    const skipped: SkippedFile[] = [];
    for (const file of files) {
      if (AUDIO_EXT_RE.test(file.name)) {
        routed.push({ file, targetKind: 'volume', targetNumber: 1 });
      } else {
        skipped.push({ sourceName: file.name, reason: 'unmatched' });
      }
    }
    return { routed, skipped };
  }

  // Ebook short-circuit: route ebook files (epub/pdf/mobi/azw) by their own
  // parsed volume number, defaulting to the release target (or volume 1) when the
  // filename has none — a single ebook like "Atomic Habits James Clear.pdf" has
  // no "v01", so the generic batch path would skip it and nothing would import.
  // Non-ebook files (e.g. the mp3s in an ebook+audiobook combo pack) are ignored.
  if (contentType === 'ebook') {
    const routed: Routed[] = [];
    const skipped: SkippedFile[] = [];
    const fallbackVol = Math.floor(release.targetLow ?? 1) || 1;
    for (const file of files) {
      if (!EBOOK_EXT_RE.test(file.name)) {
        skipped.push({ sourceName: file.name, reason: 'unmatched' });
        continue;
      }
      const parsed = parseFilename(basename(file.name));
      const vol = parsed.volume ?? fallbackVol;
      routed.push({ file, targetKind: 'volume', targetNumber: Math.floor(vol) });
    }
    return { routed, skipped };
  }

  const routed: Routed[] = [];
  const skipped: SkippedFile[] = [];

  const single =
    release.targetLow !== null &&
    release.targetHigh !== null &&
    release.targetLow === release.targetHigh &&
    release.targetKind !== 'batch';

  // Open batch: a batch release with no numeric range (e.g. a "(Complete)"
  // series pack). There's nothing to bound by, so route each file by its OWN
  // parsed volume/chapter number — the importer matches it to the series'
  // volumes/chapters. (Previously these were all skipped, so complete-series
  // packs imported nothing.)
  const openBatch =
    release.targetKind === 'batch' &&
    (release.targetLow === null || release.targetHigh === null);

  if (single) {
    const target = release.targetLow as number;
    for (const file of files) {
      if (!isArchive(file.name)) {
        skipped.push({ sourceName: file.name, reason: 'unmatched' });
        continue;
      }
      routed.push({ file, targetKind: granularity, targetNumber: target });
    }
    return { routed, skipped };
  }

  // Batch path. Bounds are applied only when present; an open batch (null range)
  // accepts any parseable number and relies on the per-file parsed value.
  const lo = release.targetLow;
  const hi = release.targetHigh;
  const inBounds = (n: number): boolean =>
    openBatch || (lo !== null && hi !== null && n >= lo && n <= hi);
  for (const file of files) {
    if (!isArchive(file.name)) {
      skipped.push({ sourceName: file.name, reason: 'unmatched' });
      continue;
    }
    const parsed = parseFilename(basename(file.name));
    if (granularity === 'volume') {
      if (parsed.volume === null || !inBounds(parsed.volume)) {
        skipped.push({ sourceName: file.name, reason: 'unmatched' });
        continue;
      }
      routed.push({ file, targetKind: 'volume', targetNumber: parsed.volume });
    } else {
      if (parsed.chapter === null) {
        skipped.push({ sourceName: file.name, reason: 'unmatched' });
        continue;
      }
      const num = parseFloat(parsed.chapter.split('-')[0] ?? '');
      if (!Number.isFinite(num) || !inBounds(num)) {
        skipped.push({ sourceName: file.name, reason: 'unmatched' });
        continue;
      }
      routed.push({ file, targetKind: 'chapter', targetNumber: num });
    }
  }
  return { routed, skipped };
}

export async function routeFilesWithExtract(
  release: ReleaseRow,
  granularity: Granularity,
  files: QbtFile[],
  resolveAbsolutePath: (qbtFile: QbtFile) => string,
  contentType?: ContentType,
): Promise<RouteResult> {
  const expanded: QbtFile[] = [];
  for (const f of files) {
    if (!isOuterArchive(f.name)) {
      expanded.push(f);
      continue;
    }
    const unpacked = await unpackArchive(resolveAbsolutePath(f));
    if (!unpacked) {
      // Extract failed — skip the archive but continue with other files.
      continue;
    }
    expanded.push(...unpacked.files);
  }
  return routeFiles(release, granularity, expanded, contentType);
}
