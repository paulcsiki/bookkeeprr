import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import type { ContentType } from '@/server/content-type';
import { describeAudio } from '@/server/reader/formats/audio';
import { isZipFamily, listImageEntries, sevenZipBin } from '@/server/reader/formats/archive';
import { parseEpub } from '@/server/reader/formats/epub';
import { pdfPageCount } from '@/server/reader/formats/pdf';
import { formatForExt, readerForFormat } from '@/server/reader/readable';
import type { ReaderFormat, ReaderKind } from '@/server/reader/readable';

const execFileAsync = promisify(execFile);

/**
 * Three-state health result. The distinction between `bad` and `inconclusive`
 * is SAFETY-CRITICAL: callers delete/reject ONLY on `bad`. A checker that
 * *couldn't run* (missing `7z`, an IO error) must return `inconclusive` so a
 * broken host environment can never trigger mass deletion downstream.
 */
export type HealthResult =
  | { status: 'ok'; format: ReaderFormat }
  | { status: 'bad'; reason: string }
  | { status: 'inconclusive'; reason: string };

/** Reader kinds accepted for each content type (the wrong-format guard). */
const EXPECTED_KINDS: Record<ContentType, Set<ReaderKind>> = {
  manga: new Set<ReaderKind>(['comics']),
  comic: new Set<ReaderKind>(['comics']),
  // cbz scans are a legitimate delivery format for prose, so text+comics both ok.
  light_novel: new Set<ReaderKind>(['text', 'comics']),
  ebook: new Set<ReaderKind>(['text', 'comics']),
  audiobook: new Set<ReaderKind>(['audio']),
};

// ---------------------------------------------------------------------------
// 7z availability probe.
//
// Non-zip archives (cbr/rar/7z) shell out to `7z`; a missing/un-runnable binary
// is INDISTINGUISHABLE from a corrupt archive at the prober level. We therefore
// probe `7z` availability up-front and treat its absence as `inconclusive`,
// never `bad`. The probe is memoized (a process either has 7z or it doesn't).
// ---------------------------------------------------------------------------

async function defaultSevenZipProbe(): Promise<boolean> {
  try {
    // `7z i` prints supported-format info and exits 0 when the binary runs.
    // Any spawn failure (ENOENT) or non-zero exit → not usable here.
    await execFileAsync(sevenZipBin(), ['i'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

let sevenZipProbe: () => Promise<boolean> = defaultSevenZipProbe;
let sevenZipAvailable: Promise<boolean> | null = null;

function isSevenZipAvailable(): Promise<boolean> {
  if (sevenZipAvailable === null) sevenZipAvailable = sevenZipProbe();
  return sevenZipAvailable;
}

/** Test-only: override the availability probe and clear the memoized result. */
export function __setSevenZipProbeForTest(probe: () => Promise<boolean>): void {
  sevenZipProbe = probe;
  sevenZipAvailable = null;
}

/** Test-only: restore the real probe and clear the memoized result. */
export function __resetSevenZipProbeForTest(): void {
  sevenZipProbe = defaultSevenZipProbe;
  sevenZipAvailable = null;
}

/** Does this errno look like an IO/permission problem rather than corruption? */
function isIoError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return (
    code === 'EACCES' ||
    code === 'EPERM' ||
    code === 'EISDIR' ||
    code === 'EBUSY' ||
    code === 'EMFILE' ||
    code === 'ENFILE' ||
    code === 'ELOOP'
  );
}

/**
 * Open a single file with the reader probers and classify its health.
 *
 * Order: format → wrong-format → existence/IO → (external-binary guard) →
 * per-kind prober. Corruption maps to `bad`; an un-runnable checker or IO
 * error maps to `inconclusive`.
 */
export async function checkFile(path: string, contentType: ContentType): Promise<HealthResult> {
  // 1. Format from extension.
  const fmt = formatForExt(path);
  if (fmt === null) return { status: 'bad', reason: 'unknown-format' };

  // 2. Wrong-format guard (e.g. an .mp3 inside an ebook series).
  const kind = readerForFormat(fmt);
  if (!EXPECTED_KINDS[contentType].has(kind)) {
    return { status: 'bad', reason: 'wrong-format' };
  }

  // 3. Existence / IO. A missing file is `bad/missing`; an IO/permission error
  //    is `inconclusive/io-error` (we couldn't read it, not that it's corrupt).
  try {
    await stat(path);
  } catch (err) {
    if ((err as { code?: unknown } | null)?.code === 'ENOENT') {
      return { status: 'bad', reason: 'missing' };
    }
    return { status: 'inconclusive', reason: 'io-error' };
  }

  // 4. Per-kind prober.
  try {
    switch (kind) {
      case 'comics': {
        const zipFamily = await isZipFamily(path);
        if (!zipFamily) {
          // Non-zip archive (cbr/rar/7z): shells to `7z`. CRITICAL — probe the
          // binary FIRST so a missing 7z is `inconclusive`, never `bad`.
          if (!(await isSevenZipAvailable())) {
            return { status: 'inconclusive', reason: '7z-unavailable' };
          }
          try {
            const images = await listImageEntries(path);
            if (images.length >= 1) return { status: 'ok', format: fmt };
            return { status: 'bad', reason: 'no-images' };
          } catch {
            // 7z runs but the list failed. Corruption of a rar is rarer than a
            // flaky external call — bias to NOT delete.
            return { status: 'inconclusive', reason: 'archive-check-failed' };
          }
        }
        // Zip-family (cbz/zip/epub): native reader, no external dep → a throw
        // here is genuine corruption.
        let images: string[];
        try {
          images = await listImageEntries(path);
        } catch (err) {
          if (isIoError(err)) return { status: 'inconclusive', reason: 'io-error' };
          return { status: 'bad', reason: 'unreadable-archive' };
        }
        if (images.length >= 1) return { status: 'ok', format: fmt };
        return { status: 'bad', reason: 'no-images' };
      }

      case 'text': {
        if (fmt === 'epub') {
          try {
            const manifest = await parseEpub(path);
            if (manifest.spine.length >= 1) return { status: 'ok', format: fmt };
            return { status: 'bad', reason: 'empty-epub' };
          } catch (err) {
            if (isIoError(err)) return { status: 'inconclusive', reason: 'io-error' };
            return { status: 'bad', reason: 'unreadable-epub' };
          }
        }
        if (fmt === 'mobi' || fmt === 'azw3') {
          // MOBI/AZW3 are parsed client-side by foliate-js; there is no Node
          // prober here. We've confirmed the file exists and has a recognised
          // ebook extension — treat as inconclusive (imports, never deleted)
          // rather than asserting integrity we cannot verify, mirroring the
          // `7z-unavailable` path.
          return { status: 'inconclusive', reason: 'no-server-parser' };
        }
        // pdf
        try {
          const pages = await pdfPageCount(path);
          if (pages >= 1) return { status: 'ok', format: fmt };
          return { status: 'bad', reason: 'unreadable-pdf' };
        } catch (err) {
          if (isIoError(err)) return { status: 'inconclusive', reason: 'io-error' };
          return { status: 'bad', reason: 'unreadable-pdf' };
        }
      }

      case 'audio': {
        // describeAudio never throws; a null duration means we couldn't parse a
        // single frame/box → treat as corrupt.
        const info = await describeAudio(path);
        if (info.durationSec != null) return { status: 'ok', format: fmt };
        return { status: 'bad', reason: 'unreadable-audio' };
      }
    }
  } catch (err) {
    // Defensive catch-all: an unexpected IO error is inconclusive; otherwise
    // we cannot prove corruption, so stay inconclusive rather than delete.
    if (isIoError(err)) return { status: 'inconclusive', reason: 'io-error' };
    return { status: 'inconclusive', reason: 'check-failed' };
  }
}

/**
 * Health-check a set of routed files for one content type.
 *
 * `ok` is true iff there are NO `bad` files AND at least one file was checked.
 * `inconclusive` files are surfaced but NEVER flip `ok` — that guarantees a
 * missing `7z` (or any checker that couldn't run) can't block an import or
 * trigger a deletion.
 */
export async function checkFiles(
  files: { path: string; name: string }[],
  contentType: ContentType,
): Promise<{
  ok: boolean;
  failures: { name: string; reason: string }[];
  inconclusive: { name: string; reason: string }[];
}> {
  const failures: { name: string; reason: string }[] = [];
  const inconclusive: { name: string; reason: string }[] = [];

  for (const file of files) {
    const result = await checkFile(file.path, contentType);
    if (result.status === 'bad') failures.push({ name: file.name, reason: result.reason });
    else if (result.status === 'inconclusive') {
      inconclusive.push({ name: file.name, reason: result.reason });
    }
  }

  const ok = failures.length === 0 && files.length >= 1;
  return { ok, failures, inconclusive };
}
