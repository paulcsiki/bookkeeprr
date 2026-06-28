import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseReadableKey } from '@bookkeeprr/types';
import { requireUserId } from '@/server/auth/require-user';
import { addReadingTime, UNKNOWN_CONTENT_TYPE } from '@/server/db/reading-stats';
import type { ContentType } from '@/server/content-type';
import { utcDayString } from '@/server/db/reading-stats-util';
import { resolveReadable } from '@/server/reader/readable';

export const dynamic = 'force-dynamic';

/** Cap per-call seconds so a misbehaving client can't inflate totals. */
const MAX_SECONDS_PER_CALL = 120;

const Body = z
  .object({
    // Upper bound is intentionally generous; oversized values are clamped to
    // MAX_SECONDS_PER_CALL below rather than rejected, so a client that batched
    // a long window still gets credited (just capped).
    seconds: z.number().min(0).max(1_000_000),
    units: z.number().min(0).max(1_000_000).optional(),
    /**
     * The readable this time was spent on. Optional for backward compat with
     * older clients that don't send it (those rows fall back to the `'other'`
     * content-type sentinel). The server resolves the authoritative series
     * content type from this key so a client can't mis-attribute time.
     */
    readableKey: z.string().max(256).optional(),
  })
  .strict();

/**
 * Resolve the authoritative content type for a readableKey via its series.
 * Returns the `'other'` sentinel when the key is missing, malformed, or no
 * longer resolves (the heartbeat is best-effort; it must never 4xx on a stale
 * key).
 */
async function resolveContentType(
  readableKey: string | undefined,
): Promise<ContentType | typeof UNKNOWN_CONTENT_TYPE> {
  if (readableKey === undefined) return UNKNOWN_CONTENT_TYPE;
  let parsed;
  try {
    parsed = parseReadableKey(readableKey);
  } catch {
    return UNKNOWN_CONTENT_TYPE;
  }
  const ref = parsed.kind === 'page' ? { fileId: parsed.fileId } : { volumeId: parsed.volumeId };
  const resolved = await resolveReadable(ref);
  if ('error' in resolved) return UNKNOWN_CONTENT_TYPE;
  return resolved.contentType;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = await requireUserId(req);
  if (userId === null) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'invalid payload', detail: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  const seconds = Math.min(MAX_SECONDS_PER_CALL, Math.round(body.seconds));
  const units = body.units !== undefined ? Math.round(body.units) : 0;
  const contentType = await resolveContentType(body.readableKey);

  await addReadingTime({ userId, day: utcDayString(new Date()), seconds, units, contentType });
  return NextResponse.json({ ok: true }, { status: 200 });
}
