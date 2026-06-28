import { and, asc, eq, gt } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { volumes, libraryFiles } from '@/server/db/schema';
import { getVolume } from '@/server/db/volumes';
import { getProgress, upsertProgress } from '@/server/db/reading-progress';
import { resolveReadable } from '@/server/reader/readable';
import type { ContentType } from '@/server/content-type';

// Tiny non-zero position so the next volume surfaces as a "0% — up next" tile in
// the continue-reading widget (which shows rows with 0 < position < 0.999),
// without a schema change. Reading it resumes effectively from the start.
const QUEUED_POSITION = 0.0001;

/**
 * When a volume is finished, queue the next owned volume of the same series into
 * the continue-reading widget — like a series auto-play "up next". No-op when
 * there is no later owned volume, or when the next volume already has progress
 * (so we never clobber something the user is reading / has finished).
 */
export async function queueNextInSeries(input: {
  userId: number;
  seriesId: number;
  currentVolumeId: number;
  contentType: ContentType;
  deviceId: string | null;
}): Promise<void> {
  const current = await getVolume(input.currentVolumeId);
  if (!current) return;

  // Smallest-numbered owned volume after the current one (must have a file).
  const rows = await getDb()
    .selectDistinct({ id: volumes.id })
    .from(volumes)
    .innerJoin(libraryFiles, eq(libraryFiles.volumeId, volumes.id))
    .where(and(eq(volumes.seriesId, input.seriesId), gt(volumes.number, current.number)))
    .orderBy(asc(volumes.number))
    .limit(1);
  const next = rows[0];
  if (!next) return;

  const resolved = await resolveReadable({ volumeId: next.id });
  if ('error' in resolved) return;

  // Don't overwrite existing progress (already reading / finished / queued).
  if (await getProgress(input.userId, resolved.readableKey)) return;

  await upsertProgress({
    userId: input.userId,
    readableKey: resolved.readableKey,
    seriesId: input.seriesId,
    volumeId: next.id,
    libraryFileId: resolved.file?.id ?? null,
    contentType: input.contentType,
    position: QUEUED_POSITION,
    locator: null,
    deviceId: input.deviceId,
    deviceName: null,
  });
}
