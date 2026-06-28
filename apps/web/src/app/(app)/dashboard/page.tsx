import type { CSSProperties } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Sliders } from 'lucide-react';
import { getDashboardPrefs } from '@/server/db/dashboard-prefs';
import { getSessionByToken } from '@/server/db/sessions';
import { getUser, listUsers } from '@/server/db/users';
import {
  packRows,
  rowColumns,
  greetingFromHour,
  firstNameOf,
  periodFromQuery,
  type WidgetId,
} from '@/components/dashboard';
import { ContinueWidget } from '@/components/dashboard/widgets/ContinueWidget';
import { PersonalWidget } from '@/components/dashboard/widgets/PersonalWidget';
import { GoalsWidget } from '@/components/dashboard/widgets/GoalsWidget';
import { LeaderboardWidget } from '@/components/dashboard/widgets/LeaderboardWidget';
import { FormatWidget } from '@/components/dashboard/widgets/FormatWidget';
import { FeedWidget, type FeedActor } from '@/components/dashboard/widgets/FeedWidget';
import { ReleasesWidget } from '@/components/dashboard/widgets/ReleasesWidget';
import { ServerWidget } from '@/components/dashboard/widgets/ServerWidget';
import { RecentWidget } from '@/components/dashboard/widgets/RecentWidget';
import { RangeControl } from './RangeControl';
import {
  CustomizeProvider,
  CustomizeButton,
  EmptyCustomizeButton,
} from './CustomizeProvider';
import { GoalsProvider } from './GoalsProvider';
import { loadDashboardData } from './data';

export const dynamic = 'force-dynamic';

function todayLabel(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}): Promise<React.JSX.Element> {
  const jar = await cookies();
  const token = jar.get('bookkeeprr_session')?.value ?? null;
  if (token === null) redirect('/login?next=/dashboard');
  const session = await getSessionByToken(token);
  if (session === null) redirect('/login?next=/dashboard');
  const user = await getUser(session.userId);
  if (user === null || user.disabled) redirect('/login?next=/dashboard');

  const { range } = await searchParams;
  const period = periodFromQuery(range);

  const displayName = user.displayName ?? user.username;
  const [data, members, prefs] = await Promise.all([
    loadDashboardData(user.id, displayName, period),
    listUsers(),
    getDashboardPrefs(user.id),
  ]);

  // Actor lookup for the activity feed: userId → name + avatar (null = system).
  const memberById = new Map(members.map((m) => [m.id, m]));
  const actorFor = (userId: number | null): FeedActor => {
    if (userId === null) return null;
    const m = memberById.get(userId);
    if (!m) return null;
    return {
      name: m.displayName ?? m.username,
      avatarUrl: m.avatarPath != null ? `/api/auth/me/avatar/${m.id}` : null,
    };
  };

  const multiMember = data.memberCount > 1;

  // Per-user customize prefs: render only enabled widgets in the stored order.
  const visible: WidgetId[] = prefs.order.filter((id) => prefs.enabled[id]);
  const rows = packRows(visible);

  const render: Record<WidgetId, React.ReactNode> = {
    continue: <ContinueWidget items={data.continueItems} />,
    personal: <PersonalWidget personal={data.personal} period={period} />,
    goals: <GoalsWidget goals={data.goals} />,
    leaderboard: (
      <LeaderboardWidget
        data={data.leaderboard}
        period={period}
        currentUserId={user.id}
        multiMember={multiMember}
      />
    ),
    format: <FormatWidget format={data.format} period={period} />,
    feed: <FeedWidget items={data.feed} actorFor={actorFor} multiMember={multiMember} />,
    releases: <ReleasesWidget items={data.releases} />,
    server: <ServerWidget server={data.server} period={period} />,
    recent: <RecentWidget items={data.recent} />,
  };

  return (
    <CustomizeProvider initial={prefs}>
      <GoalsProvider
        goals={data.goals.goals}
        progress={{
          yearBooksDone: data.goals.yearBooksDone,
          weekMinutesDone: data.goals.weekMinutesDone,
          streakDays: data.goals.streakDays,
        }}
      >
      <div className="mx-auto flex max-w-[1380px] flex-col gap-[30px] pb-8">
        {/* header */}
        <div className="flex flex-wrap items-end gap-5">
          <div>
            <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              {todayLabel()}
            </div>
            <h1 className="font-display text-[34px] font-semibold leading-none tracking-[-0.03em]">
              {greetingFromHour(new Date().getHours())},{' '}
              <span className="text-primary">{firstNameOf(displayName)}</span>
            </h1>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                Stats range
              </span>
              <RangeControl value={period} />
            </div>
            <CustomizeButton />
          </div>
        </div>

        {rows.length === 0 ? (
          /* all widgets disabled → full-page empty */
          <div className="grid min-h-[40vh] place-items-center text-center text-muted-foreground">
            <div className="max-w-[320px]">
              <div className="mx-auto mb-3.5 grid size-[52px] place-items-center rounded-[13px] border border-border bg-elevated">
                <Sliders className="size-[22px] text-muted-foreground" aria-hidden />
              </div>
              <div className="font-display text-[19px] font-semibold text-foreground">
                Your dashboard is empty
              </div>
              <div className="mt-1.5 text-[13px] leading-relaxed">
                Turn widgets back on to fill it up.
              </div>
              <EmptyCustomizeButton />
            </div>
          </div>
        ) : (
          /* widget grid (per-user order, enabled only) */
          rows.map((row, ri) => {
            if (row.length === 1) {
              return <div key={ri}>{render[row[0]!]}</div>;
            }
            const [a, b] = row as [WidgetId, WidgetId];
            return (
              // Stack the pair into one column below `lg`; apply the prototype's
              // weighted split (1.6fr/1fr etc.) only on desktop. The ratio is
              // dynamic so it rides on a CSS var — the breakpoint gating lives in
              // the static utility, which Tailwind can compile.
              <div
                key={ri}
                className="grid grid-cols-1 items-stretch gap-[30px] lg:[grid-template-columns:var(--dash-row-cols)]"
                style={{ '--dash-row-cols': rowColumns(a, b) } as CSSProperties}
              >
                <div className="min-w-0">{render[a]}</div>
                <div className="min-w-0">{render[b]}</div>
              </div>
            );
          })
        )}
      </div>
      </GoalsProvider>
    </CustomizeProvider>
  );
}
