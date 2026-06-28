import { type NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/server/auth/require-user';
import { getUser, listUsers } from '@/server/db/users';
import { periodFromQuery } from '@/components/dashboard/page-layout';
import { loadDashboardData } from '@/app/(app)/dashboard/data';

export const dynamic = 'force-dynamic';

/**
 * Dashboard data for the mobile Home screen — the same payload the web dashboard
 * assembles server-side, as JSON. Activity-feed actors are resolved to a name +
 * avatar URL here so the client doesn't need the household user list, and all
 * Date fields are serialized to ISO strings.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const userId = await requireUserId(req);
  if (userId === null) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const user = await getUser(userId);
  if (user === null || user.disabled) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const period = periodFromQuery(req.nextUrl.searchParams.get('range') ?? undefined);
  const displayName = user.displayName ?? user.username;

  const [data, members] = await Promise.all([
    loadDashboardData(userId, displayName, period),
    listUsers(),
  ]);

  const memberById = new Map(members.map((m) => [m.id, m]));
  const feed = data.feed.map((f) => {
    const actor = f.userId != null ? memberById.get(f.userId) : undefined;
    return {
      id: f.id,
      kind: f.kind,
      seriesId: f.seriesId,
      volumeId: f.volumeId,
      seriesTitle: f.seriesTitle,
      coverUrl: f.coverUrl,
      contentType: f.contentType,
      createdAt: f.createdAt.toISOString(),
      actorName: actor ? (actor.displayName ?? actor.username) : null,
      actorAvatarUrl: actor?.avatarPath != null ? `/api/auth/me/avatar/${actor.id}` : null,
    };
  });

  return NextResponse.json({
    period: data.period,
    greetingName: data.greetingName,
    memberCount: data.memberCount,
    continueItems: data.continueItems,
    personal: data.personal,
    goals: data.goals,
    leaderboard: data.leaderboard,
    format: data.format,
    releases: data.releases,
    server: data.server,
    recent: data.recent,
    feed,
  });
}
