import { desc, eq } from 'drizzle-orm';
import { getDb } from './client';
import { activityEvents, series, volumes, type ActivityEventRow } from './schema';
import { withWriteLock } from './write-lock';
import { logger } from '@/server/logger';
import type { ContentType } from '@/server/content-type';

/**
 * The kinds of household activity the feed surfaces. Extend here (and at the
 * emitter site) if a new event type is needed.
 */
export type ActivityKind = 'finished' | 'started' | 'added' | 'imported' | 'grabbed' | 'moved';

export type RecordActivityInput = {
  /** Acting user; null for job-context events (importer/grabber) with no session. */
  userId?: number | null;
  kind: ActivityKind;
  seriesId?: number | null;
  volumeId?: number | null;
  /** Free-form metadata serialized to `meta_json`, e.g. `{ readableKey }`. */
  meta?: Record<string, unknown>;
};

/**
 * Record an activity event. Best-effort: this NEVER throws into the caller — the
 * emitter sites are host flows (reader save, series add, import, grab) that must
 * not break if the feed write fails. Failures are logged and swallowed.
 */
export async function recordActivity(input: RecordActivityInput): Promise<void> {
  try {
    await withWriteLock(() =>
      getDb()
        .insert(activityEvents)
        .values({
          userId: input.userId ?? null,
          kind: input.kind,
          seriesId: input.seriesId ?? null,
          volumeId: input.volumeId ?? null,
          metaJson: JSON.stringify(input.meta ?? {}),
        }),
    );
  } catch (err) {
    logger().warn({ err, kind: input.kind }, 'recordActivity failed (best-effort, ignored)');
  }
}

/** One activity event joined to its series for feed/timeline rendering. */
export type ActivityFeedItem = {
  id: number;
  userId: number | null;
  kind: string;
  seriesId: number | null;
  volumeId: number | null;
  meta: Record<string, unknown>;
  createdAt: Date;
  /** Joined series fields (null when the series was deleted or the event has none). */
  seriesTitle: string | null;
  coverUrl: string | null;
  contentType: ContentType | null;
  /** Joined volume fields (null when no volume linked or the volume was deleted). */
  volumeNumber: number | null;
  volumeTitle: string | null;
};

function parseMeta(metaJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(metaJson) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function toFeedItem(row: {
  event: ActivityEventRow;
  titleEnglish: string | null;
  titleRomaji: string | null;
  titleNative: string | null;
  coverUrl: string | null;
  contentType: ContentType | null;
  volumeNumber: number | null;
  volumeTitle: string | null;
}): ActivityFeedItem {
  return {
    id: row.event.id,
    userId: row.event.userId,
    kind: row.event.kind,
    seriesId: row.event.seriesId,
    volumeId: row.event.volumeId,
    meta: parseMeta(row.event.metaJson),
    createdAt: row.event.createdAt,
    seriesTitle: row.titleEnglish ?? row.titleRomaji ?? row.titleNative ?? null,
    coverUrl: row.coverUrl,
    contentType: row.contentType,
    volumeNumber: row.volumeNumber,
    volumeTitle: row.volumeTitle,
  };
}

const SELECT_WITH_SERIES = {
  event: activityEvents,
  titleEnglish: series.titleEnglish,
  titleRomaji: series.titleRomaji,
  titleNative: series.titleNative,
  coverUrl: series.coverUrl,
  contentType: series.contentType,
  volumeNumber: volumes.number,
  volumeTitle: volumes.title,
};

/** Recent activity across all users, newest first, joined to series. */
export async function listRecentActivity(limit: number): Promise<ActivityFeedItem[]> {
  const rows = await getDb()
    .select(SELECT_WITH_SERIES)
    .from(activityEvents)
    .leftJoin(series, eq(activityEvents.seriesId, series.id))
    .leftJoin(volumes, eq(activityEvents.volumeId, volumes.id))
    .orderBy(desc(activityEvents.createdAt), desc(activityEvents.id))
    .limit(limit);
  return rows.map(toFeedItem);
}

/** One user's activity timeline, newest first, joined to series. */
export async function listUserActivity(
  userId: number,
  limit: number,
): Promise<ActivityFeedItem[]> {
  const rows = await getDb()
    .select(SELECT_WITH_SERIES)
    .from(activityEvents)
    .leftJoin(series, eq(activityEvents.seriesId, series.id))
    .leftJoin(volumes, eq(activityEvents.volumeId, volumes.id))
    .where(eq(activityEvents.userId, userId))
    .orderBy(desc(activityEvents.createdAt), desc(activityEvents.id))
    .limit(limit);
  return rows.map(toFeedItem);
}
