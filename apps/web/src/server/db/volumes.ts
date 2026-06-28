import { eq } from 'drizzle-orm';
import { getDb } from './client';
import { volumes, type VolumeRow } from './schema';
import { withWriteLock } from './write-lock';
import { purgeCachedImage } from '@/server/images/cache';

export type VolumeCreate = {
  seriesId: number;
  number: number;
  title?: string | null;
  releaseDate?: Date | null;
  metadataJson?: string;
};

export type VolumeUpdate = Partial<{
  title: string | null;
  releaseDate: Date | null;
  metadataJson: string;
}>;

export async function insertVolume(input: VolumeCreate): Promise<number> {
  return withWriteLock(async () => {
    const [row] = await getDb()
      .insert(volumes)
      .values({
        seriesId: input.seriesId,
        number: input.number,
        title: input.title ?? null,
        releaseDate: input.releaseDate ?? null,
        metadataJson: input.metadataJson ?? '{}',
      })
      .returning({ id: volumes.id });
    if (!row) throw new Error('insertVolume: insert returned no row');
    return row.id;
  });
}

export async function listVolumesBySeries(seriesId: number): Promise<VolumeRow[]> {
  return getDb().select().from(volumes).where(eq(volumes.seriesId, seriesId));
}

export async function getVolume(id: number): Promise<VolumeRow | null> {
  const rows = await getDb().select().from(volumes).where(eq(volumes.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateVolume(id: number, patch: VolumeUpdate): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  await withWriteLock(() => getDb().update(volumes).set(patch).where(eq(volumes.id, id)));
}

export async function deleteVolume(id: number): Promise<void> {
  // Grab the cover URL before deleting so we can purge its cached file.
  const rows = await getDb()
    .select({ metadataJson: volumes.metadataJson })
    .from(volumes)
    .where(eq(volumes.id, id))
    .limit(1);
  let coverUrl: string | null = null;
  try {
    const meta = rows[0] ? (JSON.parse(rows[0].metadataJson) as Record<string, unknown>) : null;
    coverUrl = typeof meta?.coverUrl === 'string' ? meta.coverUrl : null;
  } catch {
    // metadata not JSON — no cover to purge.
  }
  await withWriteLock(() => getDb().delete(volumes).where(eq(volumes.id, id)));
  await purgeCachedImage(coverUrl); // best-effort; never throws
}
