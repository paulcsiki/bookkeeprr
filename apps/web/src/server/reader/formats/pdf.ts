import { open, readFile } from 'node:fs/promises';

// The page-count structure (trailer / xref / page-tree root /Count) lives near
// the END of a PDF, so we only read the final window rather than the whole file
// (which can be hundreds of MB).
const PDF_TAIL_BYTES = 256 * 1024;

/**
 * Best-effort PDF page count.
 *
 * This is a lightweight hint, not a full parser — the client (pdf.js) refines
 * the authoritative count. We read only the last 256 KB as latin1 (PDF
 * structure is ASCII; binary stream payloads don't matter to us) and try, in
 * order:
 *
 *   1. The page-tree root `/Count <n>`. Page-tree nodes carry `/Type /Pages`
 *      and a `/Count`; nested intermediate nodes also have a `/Count`, but the
 *      root's count is the total and therefore the largest, so we take the max
 *      of every `/Count` that follows a `/Type /Pages`.
 *   2. Fallback: count `/Type /Page` leaf objects (word boundary so it doesn't
 *      also match `/Pages`).
 *
 * Always returns an integer >= 1.
 */
export async function pdfPageCount(path: string): Promise<number> {
  const fh = await open(path, 'r');
  let text: string;
  try {
    const { size } = await fh.stat();
    const start = Math.max(0, size - PDF_TAIL_BYTES);
    const length = size - start;
    const buf = Buffer.allocUnsafe(length);
    const { bytesRead } = await fh.read(buf, 0, length, start);
    text = buf.toString('latin1', 0, bytesRead);
  } finally {
    await fh.close();
  }

  // 1. Page-tree root /Count. Match "/Type /Pages ... /Count <n>" in either
  //    key order within the dictionary.
  let best = 0;
  const pagesRe = /\/Type\s*\/Pages\b/g;
  let m: RegExpExecArray | null;
  while ((m = pagesRe.exec(text)) !== null) {
    // Search a bounded window after the /Type /Pages marker for its /Count.
    const window = text.slice(m.index, m.index + 512);
    const cm = /\/Count\s+(\d+)/.exec(window);
    if (cm?.[1]) {
      const n = parseInt(cm[1], 10);
      if (Number.isFinite(n) && n > best) best = n;
    }
  }
  if (best >= 1) return best;

  // 2. Fallback: count /Type /Page leaf objects (\b stops /Pages matching).
  const leaves = text.match(/\/Type\s*\/Page\b/g);
  if (leaves && leaves.length >= 1) return leaves.length;

  // Nothing parseable — assume at least one page.
  return 1;
}

/** A flattened PDF outline entry: a section title and the 1-based page it targets. */
export type PdfOutlineEntry = { title: string; page: number };

/** A pdf.js outline node (the subset we read). */
interface OutlineNode {
  title?: string;
  dest?: string | unknown[] | null;
  items?: OutlineNode[];
}

/** A pdf.js document, narrowed to the methods we call for outline extraction. */
interface PdfDoc {
  getOutline(): Promise<OutlineNode[] | null>;
  getDestination(id: string): Promise<unknown[] | null>;
  getPageIndex(ref: unknown): Promise<number>;
  destroy(): Promise<void>;
}

/**
 * Best-effort PDF table of contents.
 *
 * Loads the document with pdf.js's Node ("legacy") build and walks its outline
 * (bookmark) tree depth-first, flattening nested items in reading order. Each
 * entry's explicit/named destination is resolved to a page reference, then to a
 * 0-based page index, which we expose as a **1-based** page number (matching how
 * the rest of the reader talks about pages to humans).
 *
 * Runs WITHOUT a pdf.js worker (`getDocument` falls back to a fake worker on the
 * main thread) — outline + `getPageIndex` are pure structural reads that need no
 * canvas, fonts, or eval. We pass `isEvalSupported: false` / `useSystemFonts:
 * false` to keep it off any DOM/eval paths in this Node/Next setup.
 *
 * Entirely best-effort: any parse/resolve failure (and any entry with an
 * unresolvable destination) is skipped, and the whole thing returns `[]` rather
 * than throwing, so a malformed PDF can never break manifest building or opening
 * the book.
 */
export async function pdfOutline(path: string): Promise<PdfOutlineEntry[]> {
  let doc: PdfDoc | undefined;
  let destroyTask: (() => Promise<void>) | undefined;
  try {
    // Node build of pdf.js. Dynamic import keeps it out of any client bundle and
    // lazy until a PDF is actually opened.
    // Cast through `unknown`: pdfjs-dist 6's exported types don't structurally
    // overlap our minimal surface, but the runtime shape is unchanged.
    const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as {
      getDocument(opts: {
        data: Uint8Array;
        isEvalSupported?: boolean;
        useSystemFonts?: boolean;
      }): { promise: Promise<PdfDoc>; destroy?: () => Promise<void> };
    };

    const data = new Uint8Array(await readFile(path));
    const task = pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: false });
    destroyTask = task.destroy ? () => task.destroy!() : undefined;
    doc = await task.promise;

    const outline = await doc.getOutline();
    if (!outline || outline.length === 0) return [];

    const entries: PdfOutlineEntry[] = [];
    const walk = async (nodes: OutlineNode[]): Promise<void> => {
      for (const node of nodes) {
        const page = await resolveOutlinePage(doc!, node.dest);
        if (page !== null && typeof node.title === 'string' && node.title.length > 0) {
          entries.push({ title: node.title, page });
        }
        if (node.items && node.items.length > 0) await walk(node.items);
      }
    };
    await walk(outline);
    return entries;
  } catch {
    // Any failure (unreadable file, parse error, unsupported PDF) → no TOC.
    return [];
  } finally {
    try {
      await doc?.destroy();
    } catch {
      /* ignore */
    }
    try {
      await destroyTask?.();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Resolve a single outline node's destination to a 1-based page number, or
 * `null` when it can't be resolved. Named destinations (`dest` is a string) are
 * looked up; the destination array's first element is the page reference.
 */
async function resolveOutlinePage(
  doc: PdfDoc,
  dest: string | unknown[] | null | undefined,
): Promise<number | null> {
  try {
    const arr = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const ref = arr[0];
    if (ref == null) return null;
    const index = await doc.getPageIndex(ref);
    if (!Number.isInteger(index) || index < 0) return null;
    return index + 1;
  } catch {
    return null;
  }
}
