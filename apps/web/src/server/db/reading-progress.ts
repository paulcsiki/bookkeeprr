import { and, desc, eq, isNull, ne, not } from 'drizzle-orm';
import { getDb } from './client';
import { readingProgress, series, volumes, type ReadingProgressRow } from './schema';
import { withWriteLock } from './write-lock';
import { proxiedCoverUrl } from '@/server/images/allowlist';
import type { ContentType } from '@/server/content-type';

/** Read `metadataJson.coverUrl` off a volume row; null when absent/malformed. */
function volumeCoverUrlFromMeta(metadataJson: string | null): string | null {
  if (!metadataJson) return null;
  try {
    const meta = JSON.parse(metadataJson) as Record<string, unknown>;
    return typeof meta?.coverUrl === 'string' ? meta.coverUrl : null;
  } catch {
    return null;
  }
}

export type UpsertProgressInput = {
  userId: number;
  readableKey: string;
  seriesId: number;
  volumeId?: number | null;
  libraryFileId?: number | null;
  contentType: ContentType;
  position: number;
  locator?: unknown;
  /** Per-device stable UUID; nullable for backward compat with older clients. */
  deviceId?: string | null;
  /** Human-readable device label, e.g. "Chrome on macOS". Nullable. */
  deviceName?: string | null;
};

export type ContinueReadingRow = ReadingProgressRow & {
  title: string | null;
  coverUrl: string | null;
  volumeNumber: number | null;
  volumeTitle: string | null;
};

export async function upsertProgress(input: UpsertProgressInput): Promise<void> {
  await withWriteLock(async () => {
    const finished = input.position >= 0.999;
    const locatorJson = JSON.stringify(input.locator ?? null);
    const volumeId = input.volumeId ?? null;
    const libraryFileId = input.libraryFileId ?? null;
    const deviceId = input.deviceId ?? null;
    const deviceName = input.deviceName ?? null;
    const now = new Date();

    const values = {
      userId: input.userId,
      readableKey: input.readableKey,
      seriesId: input.seriesId,
      volumeId,
      libraryFileId,
      contentType: input.contentType,
      position: input.position,
      locatorJson,
      finished,
      deviceId,
      deviceName,
      createdAt: now,
      updatedAt: now,
    };

    const updateSet = {
      position: input.position,
      locatorJson,
      finished,
      volumeId,
      libraryFileId,
      seriesId: input.seriesId,
      contentType: input.contentType,
      // Record the device that last wrote this shared row (drives the handoff
      // card: "resume — last read on <device>").
      deviceId,
      deviceName,
      updatedAt: now,
    };

    // One shared row per (user, readable): every device writes the same row,
    // last-write-wins. Targets the (userId, readableKey) unique index.
    await getDb()
      .insert(readingProgress)
      .values(values)
      .onConflictDoUpdate({
        target: [readingProgress.userId, readingProgress.readableKey],
        set: updateSet,
      });
  });
}

/**
 * Canonical, cross-device progress for a readable. Progress is stored per device
 * (deviceId-keyed rows), but reads should be unified so you resume where you
 * left off on ANY device and a book finished anywhere is finished everywhere.
 * Returns the furthest-progressed row as the base (its locator is the resume
 * point), with `finished` OR-ed across all devices. Null when never opened.
 */
export async function getProgress(
  userId: number,
  readableKey: string,
): Promise<ReadingProgressRow | null> {
  const rows = await getDb()
    .select()
    .from(readingProgress)
    .where(and(eq(readingProgress.userId, userId), eq(readingProgress.readableKey, readableKey)))
    .orderBy(desc(readingProgress.position), desc(readingProgress.updatedAt));
  if (rows.length === 0) return null;
  const base = rows[0]!;
  const finished = rows.some((r) => r.finished);
  return finished === base.finished ? base : { ...base, finished };
}

export async function listContinueReading(
  userId: number,
  limit: number,
): Promise<ContinueReadingRow[]> {
  // Progress is tracked per device (deviceId-keyed rows, for cross-device
  // handoff), so a single readable can have several rows. Fetch them all
  // (newest first) and COLLAPSE to one entry per readableKey — otherwise a book
  // finished on one device keeps appearing because another device's row is still
  // mid-progress. The collapsed entry takes the newest row as its base, the MAX
  // position across devices, and is finished if finished on ANY device.
  const rows = await getDb()
    .select({
      progress: readingProgress,
      titleEnglish: series.titleEnglish,
      titleRomaji: series.titleRomaji,
      titleNative: series.titleNative,
      coverUrl: series.coverUrl,
      volumeMetadataJson: volumes.metadataJson,
      volumeNumber: volumes.number,
      volumeTitle: volumes.title,
    })
    .from(readingProgress)
    .leftJoin(series, eq(readingProgress.seriesId, series.id))
    .leftJoin(volumes, eq(readingProgress.volumeId, volumes.id))
    .where(eq(readingProgress.userId, userId))
    .orderBy(desc(readingProgress.updatedAt));

  type Row = (typeof rows)[number];
  const byKey = new Map<string, { base: Row; position: number; finished: boolean }>();
  for (const r of rows) {
    const key = r.progress.readableKey;
    const cur = byKey.get(key);
    if (!cur) {
      // First (newest) row for this readable becomes the base.
      byKey.set(key, { base: r, position: r.progress.position, finished: r.progress.finished });
    } else {
      cur.position = Math.max(cur.position, r.progress.position);
      cur.finished = cur.finished || r.progress.finished;
    }
  }

  return [...byKey.values()].slice(0, limit).map(({ base, position, finished }) => {
    // Prefer the in-progress volume's own cover (e.g. the auto-queued next
    // volume) over the generic series cover, so the card shows the book the user
    // is actually on. External CDN covers are proxied so they load on every
    // client (MangaDex needs a Referer; mobile can't add upstream headers).
    const volumeCover = volumeCoverUrlFromMeta(base.volumeMetadataJson);
    const coverUrl = volumeCover ? proxiedCoverUrl(volumeCover) : (base.coverUrl ?? null);
    return {
      ...base.progress,
      position,
      finished,
      title: base.titleEnglish ?? base.titleRomaji ?? base.titleNative ?? null,
      coverUrl,
      volumeNumber: base.volumeNumber ?? null,
      volumeTitle: base.volumeTitle ?? null,
    };
  });
}

export type SeriesReadState = 'unread' | 'reading' | 'finished';

/**
 * Per-series reading state for a user, for the library "Reading" filter:
 * - `reading`  — at least one readable is partway through (0 < pos < 0.999, not finished)
 * - `finished` — no in-progress readable, but at least one finished
 * - `unread`   — no progress at all (series absent from the map)
 * In-progress wins over finished so a series you're actively reading shows as
 * "reading" even if you've finished earlier volumes.
 */
export async function getSeriesReadStates(userId: number): Promise<Map<number, SeriesReadState>> {
  const rows = await getDb()
    .select({
      seriesId: readingProgress.seriesId,
      position: readingProgress.position,
      finished: readingProgress.finished,
    })
    .from(readingProgress)
    .where(eq(readingProgress.userId, userId));
  const agg = new Map<number, { inProgress: boolean; finished: boolean }>();
  for (const r of rows) {
    const cur = agg.get(r.seriesId) ?? { inProgress: false, finished: false };
    const isFinished = r.finished || r.position >= 0.999;
    if (isFinished) cur.finished = true;
    else if (r.position > 0) cur.inProgress = true;
    agg.set(r.seriesId, cur);
  }
  const out = new Map<number, SeriesReadState>();
  for (const [sid, v] of agg) {
    out.set(sid, v.inProgress ? 'reading' : v.finished ? 'finished' : 'unread');
  }
  return out;
}

/**
 * Per-VOLUME read state within a single series, for the current user. Collapses
 * cross-device rows per volume by MOST-RECENT activity: a volume reads as
 * `finished` once you've completed it, unless there's a genuinely newer
 * in-progress session (i.e. you're re-reading it), in which case it's `reading`.
 * This ignores stale low-progress rows left on other devices that predate the
 * finish — without it, a completed volume wrongly shows "In Progress" because
 * another device still has an old partway row. Volumes with no progress (or only
 * position-0 rows) are absent from the map (treat as `unread`). Drives the
 * per-volume read indicator on the series page (web + mobile).
 */
export async function getVolumeReadStates(
  userId: number,
  seriesId: number,
): Promise<Map<number, SeriesReadState>> {
  const rows = await getDb()
    .select({
      volumeId: readingProgress.volumeId,
      position: readingProgress.position,
      finished: readingProgress.finished,
      updatedAt: readingProgress.updatedAt,
    })
    .from(readingProgress)
    .where(and(eq(readingProgress.userId, userId), eq(readingProgress.seriesId, seriesId)))
    .orderBy(desc(readingProgress.updatedAt));
  // Rows are newest-first, so the first finished / in-progress row we see per
  // volume is the newest of its kind. A position-0 row counts as neither.
  const agg = new Map<number, { finishedAt: number | null; readingAt: number | null }>();
  for (const r of rows) {
    if (r.volumeId === null) continue;
    const cur = agg.get(r.volumeId) ?? { finishedAt: null, readingAt: null };
    const t = r.updatedAt instanceof Date ? r.updatedAt.getTime() : 0;
    const isFinished = r.finished || r.position >= 0.999;
    if (isFinished) {
      if (cur.finishedAt === null) cur.finishedAt = t;
    } else if (r.position > 0) {
      if (cur.readingAt === null) cur.readingAt = t;
    }
    agg.set(r.volumeId, cur);
  }
  const out = new Map<number, SeriesReadState>();
  for (const [vid, c] of agg) {
    if (c.readingAt !== null && (c.finishedAt === null || c.readingAt > c.finishedAt)) {
      out.set(vid, 'reading');
    } else if (c.finishedAt !== null) {
      out.set(vid, 'finished');
    }
  }
  return out;
}

/**
 * The readable to resume for a series: the most-recently-touched in-progress
 * readable (cross-device collapsed — not finished on any device, 0 < pos <
 * 0.999). Null when nothing in the series is mid-read. Drives the series page's
 * "Continue reading" CTA.
 */
export async function getSeriesResume(
  userId: number,
  seriesId: number,
): Promise<{ readableKey: string; position: number } | null> {
  const rows = await getDb()
    .select({
      readableKey: readingProgress.readableKey,
      position: readingProgress.position,
      finished: readingProgress.finished,
    })
    .from(readingProgress)
    .where(and(eq(readingProgress.userId, userId), eq(readingProgress.seriesId, seriesId)))
    .orderBy(desc(readingProgress.updatedAt));
  // Collapse per readable (newest first → first-seen wins for order).
  const agg = new Map<string, { maxPos: number; finished: boolean }>();
  for (const r of rows) {
    const cur = agg.get(r.readableKey);
    if (!cur) agg.set(r.readableKey, { maxPos: r.position, finished: r.finished });
    else {
      cur.maxPos = Math.max(cur.maxPos, r.position);
      cur.finished = cur.finished || r.finished;
    }
  }
  for (const [readableKey, v] of agg) {
    if (!v.finished && v.maxPos > 0 && v.maxPos < 0.999) {
      return { readableKey, position: v.maxPos };
    }
  }
  return null;
}

export type PeerProgressRow = {
  deviceId: string;
  deviceName: string | null;
  position: number;
  updatedAt: Date;
};

/**
 * Returns progress rows for (userId, readableKey) from all devices EXCEPT
 * the one identified by selfDeviceId. Rows with a NULL deviceId are excluded
 * (they're legacy rows, not attributable to a specific device).
 */
export async function getPeers(
  userId: number,
  readableKey: string,
  selfDeviceId: string,
): Promise<PeerProgressRow[]> {
  const rows = await getDb()
    .select({
      deviceId: readingProgress.deviceId,
      deviceName: readingProgress.deviceName,
      position: readingProgress.position,
      updatedAt: readingProgress.updatedAt,
    })
    .from(readingProgress)
    .where(
      and(
        eq(readingProgress.userId, userId),
        eq(readingProgress.readableKey, readableKey),
        not(isNull(readingProgress.deviceId)),
        ne(readingProgress.deviceId, selfDeviceId),
      ),
    )
    .orderBy(desc(readingProgress.updatedAt));
  return rows
    .filter((r) => r.deviceId !== null)
    .map((r) => ({
      deviceId: r.deviceId!,
      deviceName: r.deviceName,
      position: r.position,
      updatedAt: r.updatedAt,
    }));
}

export async function deleteProgress(userId: number, readableKey: string): Promise<void> {
  await withWriteLock(() =>
    getDb()
      .delete(readingProgress)
      .where(
        and(eq(readingProgress.userId, userId), eq(readingProgress.readableKey, readableKey)),
      ),
  );
}
