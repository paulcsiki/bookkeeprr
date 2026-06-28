'use client';

import { useState } from 'react';
import { Crown, Trophy } from 'lucide-react';
import { Avatar, colorFromSeed } from '@bookkeeprr/ui';
import { Card, CardHead, Segmented, fmtMins, PERIOD_NOTE } from '@/components/dashboard';
import type { LeaderboardEntry, LeaderboardMetric } from '@/server/db/dashboard-agg';
import type { StatsPeriod } from '@/server/db/reading-stats-agg';

const METRIC_OPTIONS: { value: LeaderboardMetric; label: string }[] = [
  { value: 'time', label: 'Time' },
  { value: 'books', label: 'Books' },
  { value: 'streak', label: 'Streak' },
];

const RANK_VAR: Record<number, string> = {
  1: '--color-rank-gold',
  2: '--color-rank-silver',
  3: '--color-rank-bronze',
};

function metricDisplay(metric: LeaderboardMetric, value: number): { v: string; u: string } {
  if (metric === 'time') {
    const f = fmtMins(value);
    return { v: f.v, u: f.u || (value >= 60 ? '' : 'm') };
  }
  if (metric === 'books') return { v: String(value), u: value === 1 ? 'book' : 'books' };
  return { v: String(value), u: 'days' };
}

function metricNote(metric: LeaderboardMetric, period: StatsPeriod): string {
  const ranked =
    metric === 'time' ? 'time read' : metric === 'books' ? 'books finished' : 'streak';
  const note = metric === 'streak' ? 'current streak' : PERIOD_NOTE[period];
  return `Ranked by ${ranked} · ${note}`;
}

function LeaderRow({
  entry,
  rank,
  metric,
  you,
}: {
  entry: LeaderboardEntry;
  rank: number;
  metric: LeaderboardMetric;
  you: boolean;
}): React.JSX.Element {
  const d = metricDisplay(metric, entry.value);
  const top = rank <= 3;
  const rankVar = RANK_VAR[rank];
  return (
    <a
      href={`/profile/${entry.userId}`}
      className={`flex items-center gap-3 rounded-[10px] px-3 py-2.5 transition-colors ${
        you ? 'border border-primary/40 bg-primary/10' : 'border border-transparent hover:bg-muted'
      }`}
    >
      <span
        className="w-[22px] text-center font-mono text-[13px] font-semibold tabular-nums"
        style={{ color: top && rankVar ? `var(${rankVar})` : 'var(--color-muted-foreground)' }}
      >
        {rank}
      </span>
      <div className="relative">
        <Avatar
          email={entry.displayName}
          name={entry.displayName}
          size={34}
          avatarUrl={entry.avatarUrl}
          variant={colorFromSeed(entry.displayName)}
        />
        {rank === 1 && (
          <span className="absolute -top-2 left-1/2 -translate-x-1/2">
            <Crown className="size-3.5" style={{ color: 'var(--color-rank-gold)' }} aria-hidden />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13.5px] font-medium text-foreground">
            {entry.displayName}
          </span>
          {you && (
            <span className="rounded-full border border-primary/40 px-1.5 py-px font-mono text-[8.5px] tracking-[0.1em] text-primary">
              YOU
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate font-mono text-[9.5px] uppercase tracking-[0.04em] text-muted-foreground">
          {entry.role === 'admin' ? 'Admin' : 'Member'}
        </div>
      </div>
      <div className="text-right">
        <div
          className="font-display text-base font-semibold tracking-[-0.02em]"
          style={{ color: top && rankVar ? `var(${rankVar})` : 'var(--color-foreground)' }}
        >
          {d.v}
        </div>
        <div className="mt-px font-mono text-[9px] uppercase tracking-[0.04em] text-muted-foreground">
          {d.u}
        </div>
      </div>
    </a>
  );
}

type Props = {
  /** Pre-fetched leaderboards for all three metrics — toggled client-side. */
  data: Record<LeaderboardMetric, LeaderboardEntry[]>;
  period: StatsPeriod;
  currentUserId: number;
  /** True when the household has more than one member. */
  multiMember: boolean;
};

/**
 * Household leaderboard. The metric toggle switches client-side over the three
 * pre-fetched rankings (no refetch). Rows link to each member's profile. A
 * solo-server install shows an "Invite members" prompt; a populated-but-zero
 * period shows the roster at reduced opacity with "—" values.
 */
export function LeaderboardWidget({
  data,
  period,
  currentUserId,
  multiMember,
}: Props): React.JSX.Element {
  const [metric, setMetric] = useState<LeaderboardMetric>('time');
  const entries = data[metric];
  const anyActivity = entries.some((e) => e.value > 0);

  return (
    <Card fill>
      <CardHead
        icon={Trophy}
        title="Household leaderboard"
        accentVar="--color-rank-gold"
        action={
          <Segmented options={METRIC_OPTIONS} value={metric} onChange={setMetric} size="sm" />
        }
      />
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        {metricNote(metric, period)}
      </div>
      {!multiMember ? (
        <div className="grid min-h-[172px] place-items-center px-2 py-3 text-center">
          <div className="max-w-[300px]">
            <div className="mx-auto mb-3 grid size-[46px] place-items-center rounded-xl border border-border bg-elevated text-muted-foreground">
              <Trophy className="size-5" aria-hidden />
            </div>
            <div className="font-display text-[15px] font-semibold text-foreground">
              Just you so far
            </div>
            <div className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
              Invite household members to compare reading time, books, and streaks.
            </div>
            <a
              href="/settings/users"
              className="mt-4 inline-flex h-8 items-center rounded-lg border border-border bg-elevated px-3.5 text-[12.5px] font-medium text-foreground/80"
            >
              Invite members
            </a>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-0.5">
            {entries.map((e, i) =>
              anyActivity ? (
                <LeaderRow
                  key={e.userId}
                  entry={e}
                  rank={i + 1}
                  metric={metric}
                  you={e.userId === currentUserId}
                />
              ) : (
                <div
                  key={e.userId}
                  className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 opacity-70"
                >
                  <span className="w-[22px] text-center font-mono text-[13px] text-muted-foreground/60">
                    {i + 1}
                  </span>
                  <Avatar
                    email={e.displayName}
                    name={e.displayName}
                    size={34}
                    avatarUrl={e.avatarUrl}
                    variant={colorFromSeed(e.displayName)}
                  />
                  <div className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-foreground/80">
                    {e.displayName}
                  </div>
                  <span className="font-mono text-[15px] text-muted-foreground/60">—</span>
                </div>
              ),
            )}
          </div>
          {!anyActivity && (
            <div className="mt-3 text-center font-mono text-[10.5px] tracking-[0.04em] text-muted-foreground">
              No reading this {period === 'all' ? 'period' : period} yet — be the first on the board.
            </div>
          )}
        </>
      )}
    </Card>
  );
}
