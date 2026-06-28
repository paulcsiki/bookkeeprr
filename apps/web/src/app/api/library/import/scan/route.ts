import { NextResponse } from 'next/server';
import { requireAdmin } from '@/server/auth/require-admin';
import { scanLibraryRootsForImport } from '@/server/importer/import-scan';
import { matchScanItem } from '@/server/importer/match-candidate';
import {
  loadExistingSeriesWithOwnedVolumes,
  isScanItemAlreadyOwned,
} from '@/server/importer/owned-check';

export const dynamic = 'force-dynamic';

/**
 * Maximum number of items to match concurrently. Each item fans out to up to
 * two metadata providers (OpenLibrary + Google Books), so keeping this capped
 * avoids hammering the provider APIs when the library is large.
 */
const CONCURRENCY_CAP = 8;

/**
 * POST /api/library/import/scan — admin-only.
 *
 * Scans all configured library roots for untracked files, then queries metadata
 * providers (OpenLibrary, Google Books) for each found item in parallel (capped
 * at CONCURRENCY_CAP). Returns the full matched-item list so the import grid
 * can present suggestions for each file.
 *
 * Path-dedup (against library_files.path) happens inside scanLibraryRootsForImport.
 * Volume-dedup (skip items whose volume is already owned by a matching series)
 * happens here, after the scan, before metadata provider fan-out.
 *
 * 401/403 use the `{ message }` envelope.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const ctx = await requireAdmin(req);
  if ('status' in ctx) return NextResponse.json({ message: ctx.message }, { status: ctx.status });

  const [scanItems, existing] = await Promise.all([
    scanLibraryRootsForImport(),
    loadExistingSeriesWithOwnedVolumes(),
  ]);

  // Per-volume ownership filter: exclude items whose volume is already in the
  // library under a title-matching series. Missing volumes of an existing series
  // and items for brand-new series still surface.
  const unownedItems = scanItems.filter((item) => !isScanItemAlreadyOwned(item, existing));

  const items = [];
  for (let i = 0; i < unownedItems.length; i += CONCURRENCY_CAP) {
    const batch = unownedItems.slice(i, i + CONCURRENCY_CAP);
    const results = await Promise.all(batch.map((item) => matchScanItem(item)));
    items.push(...results);
  }

  return NextResponse.json({ items });
}
