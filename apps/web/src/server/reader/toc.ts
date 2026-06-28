import { extname } from 'node:path';
import type { ReaderManifest } from '@bookkeeprr/types';
import { listLibraryFilesBySeries } from '@/server/db/library-files';
import { buildManifest } from '@/server/reader/manifest';

/** One book-TOC entry surfaced to the details page. */
export type SeriesTocEntry = {
  /** Human-readable chapter/section title. */
  title: string;
  /**
   * A reader deep-link token (see `components/reader/lib/loc.ts`):
   * `spine:<idx>` for EPUBs, `page:<n>` for PDFs.
   */
  loc: string;
};

export type SeriesToc = {
  /** The present epub/pdf library file the entries deep-link into, or null. */
  fileId: number | null;
  entries: SeriesTocEntry[];
};

/** Extensions whose files carry an in-book TOC we can deep-link into. */
const TOC_EXTS = new Set(['.epub', '.pdf']);

/**
 * Convert a reader manifest's TOC into details-page `{ title, loc }` entries.
 * Pure — reuses the manifest's already-extracted TOC rather than re-parsing.
 *
 * Both EPUB and PDF manifests carry a `toc` array of `{ label, href, spineIdx?,
 * page? }`:
 *   - EPUB entries with a resolved `spineIdx` become a `spine:<idx>` deep-link.
 *   - PDF entries with a 1-based `page` become a `page:<n-1>` deep-link — the
 *     reader's `page:` token is a 0-based page index (see `lib/loc.ts`), so we
 *     subtract one when emitting it.
 * Entries with neither target are dropped (they can't be navigated to
 * deterministically). cbz/cbr/audio carry no in-book TOC and yield nothing.
 */
export function tocEntriesFromManifest(manifest: ReaderManifest): SeriesTocEntry[] {
  const entries: SeriesTocEntry[] = [];
  for (const t of manifest.toc ?? []) {
    if (t.page !== undefined) {
      entries.push({ title: t.label, loc: `page:${Math.max(0, t.page - 1)}` });
    } else if (t.spineIdx !== undefined) {
      entries.push({ title: t.label, loc: `spine:${t.spineIdx}` });
    }
    // else: no deterministic target — skip.
  }
  return entries;
}

/**
 * Build the book TOC for a series' present readable file. Picks the first
 * present epub/pdf library file for the series, reuses {@link buildManifest}
 * (the same pipeline the reader manifest route uses) to extract its TOC, and
 * maps it to `{ title, loc }` entries.
 *
 * Returns `{ entries: [] }` when the series has no present epub/pdf file, when
 * the file fails to resolve, or when it carries no usable TOC.
 */
export async function buildSeriesToc(seriesId: number, userId: number): Promise<SeriesToc> {
  const files = await listLibraryFilesBySeries(seriesId);
  const tocFile = files
    .filter((f) => TOC_EXTS.has(extname(f.path).toLowerCase()))
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))[0];
  if (tocFile === undefined) return { fileId: null, entries: [] };

  const manifest = await buildManifest({ fileId: tocFile.id }, userId);
  if ('error' in manifest) return { fileId: null, entries: [] };

  return { fileId: tocFile.id, entries: tocEntriesFromManifest(manifest) };
}
