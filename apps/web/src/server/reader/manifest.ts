import {
  ReaderManifestSchema,
  type ChapterMark,
  type ReaderManifest,
  type ReaderProgress,
} from '@bookkeeprr/types';
import { getSeries } from '@/server/db/series';
import { getVolume } from '@/server/db/volumes';
import { listChaptersBySeries } from '@/server/db/chapters';
import { getProgress } from '@/server/db/reading-progress';
import { listImageEntries } from '@/server/reader/formats/archive';
import { parseEpub } from '@/server/reader/formats/epub';
import { pdfPageCount, pdfOutline } from '@/server/reader/formats/pdf';
import { describeAudio } from '@/server/reader/formats/audio';
import { resolveReadable, type ReadableRef, type ResolveError } from '@/server/reader/readable';
import { mintEpubToken } from '@/server/reader/epub-token';

/**
 * Build the full manifest a player consumes for a readable. Resolves the
 * readable, probes its structure (page count / spine / tracks), folds in the
 * caller's persisted progress (finished readables come back as a fresh restart
 * at position 0), and validates the assembled shape before returning so any
 * schema drift fails loudly.
 */
export async function buildManifest(
  ref: ReadableRef,
  userId: number,
): Promise<ReaderManifest | ResolveError> {
  const resolved = await resolveReadable(ref);
  if ('error' in resolved) return resolved;

  const seriesRow = await getSeries(resolved.seriesId);
  if (seriesRow === null) return { error: 'not_found' };

  const title =
    seriesRow.titleEnglish ?? seriesRow.titleRomaji ?? seriesRow.titleNative ?? 'Untitled';
  const author = seriesRow.author ?? null;
  const coverUrl = seriesRow.coverUrl ?? null;

  let volumeLabel: string | null = null;
  if (resolved.volumeId !== null) {
    const volume = await getVolume(resolved.volumeId);
    volumeLabel = volume?.title ?? (volume ? `Vol. ${volume.number}` : null);
  }

  const base = {
    readableKey: resolved.readableKey,
    contentType: resolved.contentType,
    reader: resolved.reader,
    format: resolved.format,
    title,
    author,
    seriesId: resolved.seriesId,
    volumeId: resolved.volumeId,
    coverUrl,
    volumeLabel,
  };

  // --- structural fields by format ---
  let pageCount: number | undefined;
  let opfDir: string | undefined;
  let spine: ReaderManifest['spine'];
  let toc: ReaderManifest['toc'];
  let tracks: ReaderManifest['tracks'];
  let chapters: ChapterMark[] | undefined;
  let totalSec: number | null | undefined;
  let epubResourceToken: string | undefined;

  if (resolved.format === 'audio') {
    const audioFiles = resolved.audioFiles ?? [];
    const builtTracks: NonNullable<ReaderManifest['tracks']> = [];
    let sum = 0;
    for (let i = 0; i < audioFiles.length; i++) {
      const f = audioFiles[i]!;
      const { durationSec } = await describeAudio(f.path);
      if (durationSec !== null) sum += durationSec;
      builtTracks.push({
        idx: i,
        fileId: f.id,
        durationSec,
        title: `Track ${i + 1}`,
      });
    }
    tracks = builtTracks;
    // The summed track durations ARE the timeline total. Report the partial sum
    // even when a track failed to probe — a short-by-one total is far more
    // useful than null, which would force the reader into an even totalSec/N
    // chapter split (every track showing the same "1m"). Null only when nothing
    // probed at all.
    totalSec = sum > 0 ? sum : null;

    // Chapters from the DB if present; else one chapter per track.
    const dbChapters = await listChaptersBySeries(resolved.seriesId);
    const volChapters =
      resolved.volumeId === null
        ? dbChapters
        : dbChapters.filter((c) => c.volumeId === resolved.volumeId);
    if (volChapters.length > 0) {
      chapters = volChapters.map((c) => ({ title: c.title ?? c.numberText }));
    } else {
      // One chapter per track: stamp each chapter's start time from the running
      // sum of track durations so the reader shows each track's REAL length
      // (track 1 = 1m, track 2 = 3m, …) instead of an even totalSec/N split. A
      // null-duration track contributes 0 so later chapters don't drift back.
      let acc = 0;
      chapters = builtTracks.map((t) => {
        const startSec = acc;
        acc += t.durationSec ?? 0;
        return { title: t.title ?? `Track ${t.idx + 1}`, startSec };
      });
    }
  } else if (resolved.format === 'epub') {
    const e = await parseEpub(resolved.file!.path);
    opfDir = e.opfDir;
    spine = e.spine;
    toc = e.toc;
    // Short-lived, scoped token for the RN reader's sub-resource `?token=` auth.
    epubResourceToken = await mintEpubToken(resolved.file!.id, userId, Date.now());
  } else if (resolved.format === 'pdf') {
    pageCount = await pdfPageCount(resolved.file!.path);
    const outline = await pdfOutline(resolved.file!.path);
    if (outline.length > 0) {
      toc = outline.map(({ title, page }) => ({ label: title, href: '', page }));
    }
  } else if (resolved.format === 'mobi' || resolved.format === 'azw3') {
    // MOBI/AZW3 are parsed and paginated entirely client-side by foliate-js
    // (it fetches the whole file from the ebook download route). There is no
    // server-side spine/TOC/page-count extraction — the reader provides those
    // after load, and progress is stored as a `{ frac }` locator. Mint the
    // same short-lived per-file token the EPUB path uses so the mobile WebView
    // reader can fetch the file via `?token=` (the bearer header isn't attached
    // to WebView sub-requests).
    epubResourceToken = await mintEpubToken(resolved.file!.id, userId, Date.now());
  } else {
    // cbz / cbr / zip / rar / 7z — comics archives.
    pageCount = (await listImageEntries(resolved.file!.path)).length;
  }

  // --- progress ---
  const row = await getProgress(userId, resolved.readableKey);
  let progress: ReaderProgress;
  if (row === null) {
    progress = {
      readableKey: resolved.readableKey,
      position: 0,
      locator: null,
      finished: false,
      restartedFromFinish: false,
    };
  } else if (row.finished) {
    progress = {
      readableKey: resolved.readableKey,
      position: 0,
      locator: null,
      finished: true,
      restartedFromFinish: true,
    };
  } else {
    progress = {
      readableKey: resolved.readableKey,
      position: row.position,
      locator: JSON.parse(row.locatorJson),
      finished: false,
      restartedFromFinish: false,
    };
  }

  const manifest = {
    ...base,
    ...(pageCount !== undefined ? { pageCount } : {}),
    ...(opfDir !== undefined ? { opfDir } : {}),
    ...(spine !== undefined ? { spine } : {}),
    ...(toc !== undefined ? { toc } : {}),
    ...(tracks !== undefined ? { tracks } : {}),
    ...(chapters !== undefined ? { chapters } : {}),
    ...(totalSec !== undefined ? { totalSec } : {}),
    ...(epubResourceToken !== undefined ? { epubResourceToken } : {}),
    progress,
  };

  return ReaderManifestSchema.parse(manifest);
}
