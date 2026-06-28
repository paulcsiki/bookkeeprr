import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/server/auth/require-user';
import { getChapter } from '@/server/db/chapters';
import { setChapterRead } from '@/server/db/chapter-read';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; chapterId: string }> };

const Body = z.object({ read: z.boolean() }).strict();

function toId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * POST /api/series/[id]/chapters/[chapterId]/read — per-user read toggle.
 *
 * Session-gated (a real human user, not a service caller). Marks or unmarks a
 * chapter as read for the current user. The chapter must belong to the series
 * in the path.
 */
export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const userId = await requireUserId(req);
  if (userId === null) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id, chapterId } = await ctx.params;
  const seriesId = toId(id);
  const chId = toId(chapterId);
  if (seriesId === null || chId === null) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  let body;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'invalid payload', detail: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  const chapter = await getChapter(chId);
  if (chapter === null || chapter.seriesId !== seriesId) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  await setChapterRead(userId, chId, body.read);
  return NextResponse.json({ ok: true }, { status: 200 });
}
