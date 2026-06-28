import { type NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/server/auth/require-user';
import { getUser } from '@/server/db/users';
import { loadProfileData } from '@/app/(app)/profile/[userId]/data';

export const dynamic = 'force-dynamic';

/**
 * A household member's read-only profile dossier as JSON — the same payload the
 * web `/profile/[userId]` page assembles server-side. Consumed by the mobile
 * app's profile screen. Activity timestamps are serialized to ISO strings and
 * the unbounded `meta` blob is dropped (mirrors /api/dashboard's feed shaping).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const viewerId = await requireUserId(req);
  if (viewerId === null) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const viewer = await getUser(viewerId);
  if (viewer === null || viewer.disabled) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { userId: rawId } = await params;
  const userId = Number(rawId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json({ error: 'invalid user id' }, { status: 400 });
  }

  const data = await loadProfileData(userId, viewerId);
  if (data === null) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const activity = data.activity.map((a) => ({
    id: a.id,
    kind: a.kind,
    seriesId: a.seriesId,
    volumeId: a.volumeId,
    seriesTitle: a.seriesTitle,
    coverUrl: a.coverUrl,
    contentType: a.contentType,
    volumeNumber: a.volumeNumber,
    volumeTitle: a.volumeTitle,
    createdAt: a.createdAt.toISOString(),
  }));

  return NextResponse.json({ ...data, activity });
}
