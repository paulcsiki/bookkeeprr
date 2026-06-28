import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseReadableKey, ContentTypeSchema } from '@bookkeeprr/types';
import { requireUserId } from '@/server/auth/require-user';
import {
  getProgress,
  upsertProgress,
  deleteProgress,
} from '@/server/db/reading-progress';
import { markVolumeChaptersRead } from '@/server/db/chapter-read';
import { queueNextInSeries } from '@/server/reader/queue-next';
import { recordActivity } from '@/server/db/activity-events';
import { logger } from '@/server/logger';
import { getSeries } from '@/server/db/series';
import { getVolume } from '@/server/db/volumes';
import { getLibraryFile } from '@/server/db/library-files';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ readableKey: string }> };

const PutBody = z
  .object({
    position: z.number().min(0).max(1),
    locator: z.unknown().optional(),
    seriesId: z.number().int().positive(),
    volumeId: z.number().int().positive().nullable().optional(),
    libraryFileId: z.number().int().positive().nullable().optional(),
    contentType: ContentTypeSchema,
    /** Per-device stable UUID from the client. Optional for backward compat. */
    deviceId: z.string().max(128).nullable().optional(),
    /** Human-readable label for the writing device, e.g. "Chrome on macOS". */
    deviceName: z.string().max(256).nullable().optional(),
  })
  .strict();

/** Validate the readableKey path param; null when malformed. */
function resolveKey(key: string): string | null {
  try {
    parseReadableKey(key);
    return key;
  } catch {
    return null;
  }
}

function serializeProgress(row: {
  readableKey: string;
  position: number;
  locatorJson: string;
  finished: boolean;
}) {
  return {
    readableKey: row.readableKey,
    position: row.position,
    locator: JSON.parse(row.locatorJson) as unknown,
    finished: row.finished,
  };
}

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const userId = await requireUserId(req);
  if (userId === null) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { readableKey } = await ctx.params;
  const key = resolveKey(readableKey);
  if (key === null) return NextResponse.json({ error: 'invalid readableKey' }, { status: 400 });

  const row = await getProgress(userId, key);
  if (row === null) {
    return NextResponse.json(
      { readableKey: key, position: 0, locator: null, finished: false },
      { status: 200 },
    );
  }
  return NextResponse.json(serializeProgress(row), { status: 200 });
}

export async function PUT(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const userId = await requireUserId(req);
  if (userId === null) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { readableKey } = await ctx.params;
  const key = resolveKey(readableKey);
  if (key === null) return NextResponse.json({ error: 'invalid readableKey' }, { status: 400 });

  let body;
  try {
    body = PutBody.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'invalid payload', detail: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  // Cheap existence checks on referenced rows.
  if ((await getSeries(body.seriesId)) === null) {
    return NextResponse.json({ error: 'series not found' }, { status: 400 });
  }
  if (
    body.volumeId !== undefined &&
    body.volumeId !== null &&
    (await getVolume(body.volumeId)) === null
  ) {
    return NextResponse.json({ error: 'volume not found' }, { status: 400 });
  }
  if (
    body.libraryFileId !== undefined &&
    body.libraryFileId !== null &&
    (await getLibraryFile(body.libraryFileId)) === null
  ) {
    return NextResponse.json({ error: 'library file not found' }, { status: 400 });
  }

  // Capture the prior finished state so the activity feed only records a
  // "finished" event on the transition (not on every save while at 100%).
  const wasFinished = (await getProgress(userId, key))?.finished ?? false;

  await upsertProgress({
    userId,
    readableKey: key,
    seriesId: body.seriesId,
    volumeId: body.volumeId ?? null,
    libraryFileId: body.libraryFileId ?? null,
    contentType: body.contentType,
    position: body.position,
    locator: body.locator ?? null,
    deviceId: body.deviceId ?? null,
    deviceName: body.deviceName ?? null,
  });

  // Reader finish: when this save flips `finished` true, emit a feed event.
  // Best-effort — recordActivity never throws into this flow.
  if (!wasFinished && body.position >= 0.999) {
    await recordActivity({
      userId,
      kind: 'finished',
      seriesId: body.seriesId,
      volumeId: body.volumeId ?? null,
      meta: { readableKey: key },
    });

    // Auto-queue the next volume of the series into continue-reading ("up next").
    // Best-effort — never let it break the progress save.
    if (body.volumeId != null) {
      try {
        await queueNextInSeries({
          userId,
          seriesId: body.seriesId,
          currentVolumeId: body.volumeId,
          contentType: body.contentType,
          deviceId: body.deviceId ?? null,
        });
      } catch (err) {
        logger().warn({ err, seriesId: body.seriesId, userId }, 'queue-next failed');
      }
    }
  }

  // Auto-mark read on volume completion. When a volume readable hits 100%, mark
  // every chapter in that volume read for the user (mirrors upsertProgress'
  // finished threshold). Best-effort: never let this break progress saving.
  if (body.position >= 0.999 && body.volumeId != null) {
    try {
      await markVolumeChaptersRead(userId, body.volumeId);
    } catch (err) {
      logger().warn({ err, volumeId: body.volumeId, userId }, 'auto-mark chapters read failed');
    }
  }

  const stored = await getProgress(userId, key);
  if (stored === null) {
    // Should not happen; surface as a default to keep the contract shape.
    return NextResponse.json(
      { readableKey: key, position: 0, locator: null, finished: false },
      { status: 200 },
    );
  }
  return NextResponse.json(serializeProgress(stored), { status: 200 });
}

export async function DELETE(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const userId = await requireUserId(req);
  if (userId === null) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { readableKey } = await ctx.params;
  const key = resolveKey(readableKey);
  if (key === null) return NextResponse.json({ error: 'invalid readableKey' }, { status: 400 });

  await deleteProgress(userId, key);
  return NextResponse.json({ ok: true }, { status: 200 });
}
