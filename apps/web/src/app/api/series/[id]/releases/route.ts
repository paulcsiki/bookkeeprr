import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { getSeries } from '@/server/db/series';
import { listReleasesBySeries } from '@/server/db/releases';
import { listDownloadsForReleaseIds } from '@/server/db/downloads';
import { libraryFiles, volumes, chapters, indexers } from '@/server/db/schema';
import type { ReleaseRow } from '@/server/db/schema';

type Ownership = 'none' | 'in-library' | 'downloading';

type ReleaseView = ReleaseRow & {
  ownership: Ownership;
  indexerName: string | null;
  indexerKind: string | null;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const seriesId = Number(id);
  const series = await getSeries(seriesId);
  if (!series) {
    return NextResponse.json({ error: 'series not found' }, { status: 404 });
  }

  const releases = await listReleasesBySeries(seriesId, 200);

  // Map indexer id → name/kind so the UI can label each release's source.
  const indexerRows = await getDb()
    .select({ id: indexers.id, name: indexers.name, kind: indexers.kind })
    .from(indexers);
  const indexerById = new Map(indexerRows.map((i) => [i.id, i]));

  // Build a downloading-by-releaseId set (M7)
  const ACTIVE_DL = new Set(['queued', 'downloading', 'importing']);
  const downloadRows = await listDownloadsForReleaseIds(releases.map((r) => r.id));
  const downloadingReleaseIds = new Set(
    downloadRows.filter((d) => ACTIVE_DL.has(d.status)).map((d) => d.releaseId),
  );

  const ownedVolumes = new Set<number>();
  const ownedChapters = new Set<number>();
  if (series.granularity === 'volume') {
    const rows = await getDb()
      .select({ number: volumes.number })
      .from(libraryFiles)
      .innerJoin(volumes, eq(libraryFiles.volumeId, volumes.id))
      .where(eq(libraryFiles.seriesId, seriesId));
    rows.forEach((r) => ownedVolumes.add(r.number));
  } else {
    const rows = await getDb()
      .select({ numberSort: chapters.numberSort })
      .from(libraryFiles)
      .innerJoin(chapters, eq(libraryFiles.chapterId, chapters.id))
      .where(eq(libraryFiles.seriesId, seriesId));
    rows.forEach((r) => ownedChapters.add(r.numberSort));
  }

  const view: ReleaseView[] = releases.map((r) => {
    let ownership: Ownership = 'none';
    if (r.targetKind === 'volume' && r.targetLow !== null) {
      if (ownedVolumes.has(r.targetLow)) ownership = 'in-library';
    } else if (r.targetKind === 'chapter' && r.targetLow !== null) {
      if (ownedChapters.has(r.targetLow)) ownership = 'in-library';
    } else if (r.targetKind === 'batch' && r.targetLow !== null && r.targetHigh !== null) {
      if (series.granularity === 'volume') {
        let allOwned = true;
        for (let n = Math.floor(r.targetLow); n <= Math.floor(r.targetHigh); n++) {
          if (!ownedVolumes.has(n)) {
            allOwned = false;
            break;
          }
        }
        if (allOwned) ownership = 'in-library';
      } else {
        // chapter granularity batch
        let allOwned = true;
        for (let n = r.targetLow; n <= r.targetHigh; n++) {
          if (!ownedChapters.has(n)) {
            allOwned = false;
            break;
          }
        }
        if (allOwned) ownership = 'in-library';
      }
    }
    // Batches with null targets always 'none' — can't determine coverage.
    // Downloading ownership: in-library > downloading > none
    if (ownership === 'none' && downloadingReleaseIds.has(r.id)) {
      ownership = 'downloading';
    }
    const ix = indexerById.get(r.indexerId);
    return { ...r, ownership, indexerName: ix?.name ?? null, indexerKind: ix?.kind ?? null };
  });

  return NextResponse.json({ releases: view });
}
