'use client';

import { StatTile } from '../dashboard/StatTile';
import { useReadingStats, type ReadingStatsDay } from './hooks/useReadingStats';
import { fmtClock } from './lib/format';

/** Single-letter weekday label (UTC) for a YYYY-MM-DD day. */
function weekdayLetter(day: string): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  return ['S', 'M', 'T', 'W', 'T', 'F', 'S'][d.getUTCDay()] ?? '';
}

function WeeklyChart({ days, todayKey }: { days: ReadingStatsDay[]; todayKey: string }) {
  const max = Math.max(1, ...days.map((d) => d.secondsRead));
  return (
    <div className="flex items-end gap-2.5" style={{ height: 96 }}>
      {days.map((d) => {
        const frac = d.secondsRead / max;
        const isToday = d.day === todayKey;
        return (
          <div key={d.day} className="flex flex-1 flex-col items-center gap-2">
            <div
              data-testid="stats-bar"
              className={`w-full rounded-md ${isToday ? 'bg-primary' : 'bg-muted'}`}
              style={{ height: `${Math.max(2, Math.round(frac * 80))}px` }}
              title={`${fmtClock(d.secondsRead / 60)} · ${d.unitsRead} units`}
            />
            <span className="font-mono text-[10px] text-muted-foreground">
              {weekdayLetter(d.day)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Real reading-stats surface for the library: a 7-day chart plus streak, total
 * time and pace, sourced from `GET /api/reader/stats`. Renders nothing when the
 * user has no recorded reading yet, so it stays out of the way on a fresh
 * library. Lives in the dark app shell (standard `--color-*` tokens).
 */
export function ReadingStatsPanel(): React.JSX.Element | null {
  const { data } = useReadingStats();

  if (!data || data.totalSeconds <= 0) return null;

  const todayKey = data.days.at(-1)?.day ?? '';
  const pace = data.pacePerHour != null ? Math.round(data.pacePerHour).toString() : '—';

  return (
    <section className="space-y-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        Reading stats · last 7 days
      </div>
      <div className="space-y-4 rounded-2xl border border-border bg-card/40 p-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="This week" value={fmtClock(data.totalSeconds / 60)} unit="" />
          <StatTile label="Read" value={data.totalUnits.toString()} unit="units" />
          <StatTile label="Pace" value={pace} unit="u/hr" />
          <StatTile label="Streak" value={data.streak.toString()} unit="days" />
        </div>
        <WeeklyChart days={data.days} todayKey={todayKey} />
      </div>
    </section>
  );
}
