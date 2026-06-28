import { extname } from 'node:path';
import { buildReadableKey } from '@bookkeeprr/types';
import type { ContentType } from '@/server/content-type';
import { listLibraryFilesByVolume } from '@/server/db/library-files';
import { getSeries } from '@/server/db/series';
import { getVolume } from '@/server/db/volumes';
import { resolveLibraryFilePath } from '@/server/reader/path-safety';

export type ReaderKind = 'text' | 'comics' | 'audio';
export type ReaderFormat =
  | 'epub'
  | 'pdf'
  | 'cbz'
  | 'cbr'
  | 'zip'
  | 'rar'
  | '7z'
  | 'audio'
  | 'mobi'
  | 'azw3';

export type ReadableRef = { volumeId?: number; fileId?: number };

export type ResolvedReadable = {
  readableKey: string;
  reader: ReaderKind;
  format: ReaderFormat;
  contentType: ContentType;
  seriesId: number;
  volumeId: number | null;
  // paged formats (comics / text):
  file?: { id: number; path: string };
  // audio:
  audioFiles?: { id: number; path: string }[];
};

export type ResolveError = { error: 'not_found' | 'forbidden' | 'unsupported' };

const AUDIO_EXTS = new Set(['.m4b', '.m4a', '.mp3', '.aac', '.flac', '.ogg']);

/**
 * Which player renders this format. Derived from the FILE FORMAT, not the
 * content type: a `light_novel` series can be delivered as image archives
 * (`.cbz`), which must open in the comics (image) reader regardless of the
 * series' nominal content type.
 */
export function readerForFormat(format: ReaderFormat): ReaderKind {
  switch (format) {
    case 'cbz':
    case 'cbr':
    case 'zip':
    case 'rar':
    case '7z':
      return 'comics';
    case 'epub':
    case 'pdf':
    case 'mobi':
    case 'azw3':
      return 'text';
    case 'audio':
      return 'audio';
  }
}

/**
 * Map a file extension to a reader format. Returns null for unknown extensions.
 * Audio extensions all collapse to the single `audio` format.
 */
export function formatForExt(path: string): ReaderFormat | null {
  const ext = extname(path).toLowerCase();
  if (AUDIO_EXTS.has(ext)) return 'audio';
  switch (ext) {
    case '.epub':
      return 'epub';
    case '.pdf':
      return 'pdf';
    case '.cbz':
      return 'cbz';
    case '.cbr':
      return 'cbr';
    case '.zip':
      return 'zip';
    case '.rar':
      return 'rar';
    case '.7z':
      return '7z';
    case '.mobi':
    case '.azw':
      // .azw is the older Kindle (MOBI-based) container; foliate's mobi parser
      // handles both — collapse to the 'mobi' format.
      return 'mobi';
    case '.azw3':
      return 'azw3';
    default:
      return null;
  }
}

/** Natural-order (numeric-aware) sort by path. */
function byPath(a: { path: string }, b: { path: string }): number {
  return a.path.localeCompare(b.path, undefined, { numeric: true });
}

/**
 * Preference rank for paged formats when a volume ships multiple readable
 * files. Lower is preferred. EPUB/PDF render with native, server-assisted
 * pipelines and are richer than the client-only foliate path used for
 * MOBI/AZW3, so prefer them when a sibling exists (e.g. open the `.epub` over
 * a co-located `.azw3`). Comics archives sit between. Unsupported formats rank
 * last so a readable sibling always wins.
 */
const FORMAT_RANK: Record<ReaderFormat, number> = {
  epub: 0,
  pdf: 1,
  cbz: 2,
  cbr: 2,
  zip: 2,
  rar: 2,
  '7z': 2,
  mobi: 3,
  azw3: 3,
  audio: 99,
};

function pagedFormatRank(path: string): number {
  const fmt = formatForExt(path);
  if (fmt === null || fmt === 'audio') return 100;
  return FORMAT_RANK[fmt];
}

/**
 * Resolve a {volumeId|fileId} ref into a fully-described readable: its reader
 * (player), source format, content type, owning series/volume, and the safe
 * on-disk path(s) to its file(s).
 *
 * Audiobooks always resolve via their volume: a fileId pointing at an
 * audiobook file is redirected to the file's volume so the whole multi-track
 * timeline is returned. Paged content (comics / text) resolves to a single
 * file.
 */
export async function resolveReadable(ref: ReadableRef): Promise<ResolvedReadable | ResolveError> {
  if (ref.fileId !== undefined) {
    const resolved = await resolveLibraryFilePath(ref.fileId);
    if (!resolved.ok) return { error: resolved.error };
    const row = resolved.row;
    const seriesRow = await getSeries(row.seriesId);
    if (seriesRow === null) return { error: 'not_found' };
    const contentType = seriesRow.contentType;

    // Audiobooks always resolve via their volume timeline.
    if (contentType === 'audiobook') {
      if (row.volumeId === null) return { error: 'not_found' };
      return resolveReadable({ volumeId: row.volumeId });
    }

    const format = formatForExt(row.path);
    if (format === null || format === 'audio') return { error: 'unsupported' };
    const reader = readerForFormat(format);

    return {
      readableKey: buildReadableKey({ kind: 'page', fileId: row.id }),
      reader,
      format,
      contentType,
      seriesId: row.seriesId,
      volumeId: row.volumeId,
      file: { id: row.id, path: resolved.path },
    };
  }

  if (ref.volumeId !== undefined) {
    const volume = await getVolume(ref.volumeId);
    if (volume === null) return { error: 'not_found' };
    const seriesRow = await getSeries(volume.seriesId);
    if (seriesRow === null) return { error: 'not_found' };
    const contentType = seriesRow.contentType;

    const files = await listLibraryFilesByVolume(ref.volumeId);

    // Audiobook is the only audio content type; its multi-track timeline is
    // gated on the content type rather than per-file format.
    if (contentType === 'audiobook') {
      const audioRows = files
        .filter((f) => AUDIO_EXTS.has(extname(f.path).toLowerCase()))
        .sort(byPath);
      if (audioRows.length === 0) return { error: 'not_found' };
      // Resolve path-safety for all tracks in parallel; iterate the results in
      // the original (natural-sorted) order so the timeline is preserved.
      const resolvedRows = await Promise.all(
        audioRows.map(async (f) => ({ f, resolved: await resolveLibraryFilePath(f.id) })),
      );
      const audioFiles: { id: number; path: string }[] = [];
      for (const { f, resolved } of resolvedRows) {
        if (!resolved.ok) {
          if (resolved.error === 'forbidden') return { error: 'forbidden' };
          continue; // skip files missing on disk
        }
        audioFiles.push({ id: f.id, path: resolved.path });
      }
      if (audioFiles.length === 0) return { error: 'not_found' };
      return {
        readableKey: buildReadableKey({ kind: 'audio', volumeId: ref.volumeId }),
        reader: 'audio',
        format: 'audio',
        contentType,
        seriesId: volume.seriesId,
        volumeId: ref.volumeId,
        audioFiles,
      };
    }

    // Paged: prefer the first non-audio file whose format we can actually
    // render (natural-sorted). Falling back to the first non-audio file only
    // when none is supported preserves the existing `unsupported` error path
    // (e.g. a lone `.azw3`) while not letting an unsupported file shadow a
    // readable sibling (e.g. `.azw3` sorting ahead of `.epub`).
    const pagedFiles = files
      .filter((f) => !AUDIO_EXTS.has(extname(f.path).toLowerCase()))
      .sort(byPath);
    // Among readable paged files, prefer the richest format (epub > pdf >
    // comics > mobi/azw3); within the same rank keep natural order. Fall back
    // to the first file when none is supported, preserving the `unsupported`
    // error path.
    const paged =
      [...pagedFiles]
        .filter((f) => pagedFormatRank(f.path) < 100)
        .sort((a, b) => pagedFormatRank(a.path) - pagedFormatRank(b.path))[0] ?? pagedFiles[0];
    if (paged === undefined) return { error: 'not_found' };
    const resolved = await resolveLibraryFilePath(paged.id);
    if (!resolved.ok) return { error: resolved.error };
    const format = formatForExt(paged.path);
    if (format === null || format === 'audio') return { error: 'unsupported' };
    const reader = readerForFormat(format);
    return {
      readableKey: buildReadableKey({ kind: 'page', fileId: paged.id }),
      reader,
      format,
      contentType,
      seriesId: volume.seriesId,
      volumeId: ref.volumeId,
      file: { id: paged.id, path: resolved.path },
    };
  }

  return { error: 'not_found' };
}
