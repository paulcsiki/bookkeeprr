/**
 * Wire pdf.js's worker. pdfjs-dist v5 ships its worker as an ES module at
 * `pdfjs-dist/build/pdf.worker.min.mjs`. Resolving it through `new URL(...,
 * import.meta.url)` lets the bundler (Next/Turbopack/webpack) emit the worker as
 * a hashed asset and hand us the right URL, so no manual copy into `public/` is
 * needed.
 *
 * This module must only run on the client. Importing it from a client component
 * (which `PdfSurface` is, behind a dynamic import) keeps it out of the server
 * bundle.
 */
import * as pdfjsLib from 'pdfjs-dist';

let wired = false;

/** Idempotently point pdf.js at its worker asset. */
export function ensurePdfWorker(): typeof pdfjsLib {
  if (!wired) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();
    wired = true;
  }
  return pdfjsLib;
}
