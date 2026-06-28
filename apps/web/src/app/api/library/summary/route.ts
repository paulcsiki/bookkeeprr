import { NextResponse } from 'next/server';
import { ne, sql } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { series } from '@/server/db/schema';
import { authenticateBearer } from '@/server/mobile/bearer-middleware';

export const dynamic = 'force-dynamic';

/**
 * GET /api/library/summary — bearer-only.
 *
 * Returns aggregate counts for the mobile LibraryHome subtitle:
 *   { total, monitored, missing }
 *
 * - `total`:    count of all series.
 * - `monitored`: count of series where monitoring != 'none'.
 * - `missing`:  count of monitored series where totalVolumes is set and the
 *               number of imported volume-level library files is less than
 *               totalVolumes. This is an approximation; chapter-granularity
 *               series or series without totalVolumes are excluded (counted
 *               as not missing).
 */
export async function GET(req: Request): Promise<NextResponse> {
  const auth = await authenticateBearer(req);
  if (auth.kind !== 'authenticated') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const db = getDb();

  const [totalRow, monitoredRow, missingRow] = await Promise.all([
    // Total series count
    db.select({ count: sql<number>`count(*)` }).from(series),

    // Monitored = monitoring != 'none'
    db
      .select({ count: sql<number>`count(*)` })
      .from(series)
      .where(ne(series.monitoring, 'none')),

    // Missing: monitored series where totalVolumes is set and the count of
    // imported volume-level library files is less than totalVolumes.
    db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(series)
      .where(
        sql`monitoring != 'none'
          AND total_volumes IS NOT NULL
          AND (
            SELECT count(*) FROM library_files
            WHERE library_files.series_id = series.id
              AND library_files.volume_id IS NOT NULL
          ) < total_volumes`,
      ),
  ]);

  return NextResponse.json({
    total: Number(totalRow[0]?.count ?? 0),
    monitored: Number(monitoredRow[0]?.count ?? 0),
    missing: Number(missingRow[0]?.count ?? 0),
  });
}
