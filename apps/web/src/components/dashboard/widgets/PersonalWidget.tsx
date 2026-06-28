import { Activity, Clock, BookOpen, Check, Flame } from 'lucide-react';
import type { ContentType } from '@bookkeeprr/types';
import { CONTENT_TYPE_LABEL } from '@bookkeeprr/ui';
import {
  Card,
  CardHead,
  StatTile,
  BarWeek,
  TrendLine,
  fmtMins,
  compactNum,
  PERIOD_NOTE,
} from '@/components/dashboard';
import { ZeroCaption } from './WidgetEmpty';
import type { DashboardData } from '../../../app/(app)/dashboard/data';
import type { StatsPeriod } from '@/server/db/reading-stats-agg';

const TREND_LABELS = ['12w', '', '', '', '8w', '', '', '', '4w', '', '', 'now'];
const UNITS_PER_MINUTE = 1 / 6.2;

/** "4m" / "2h 30m" — a single-string minute label for chart hover tooltips. */
function minsLabel(min: number): string {
  const f = fmtMins(min);
  return f.u ? `${f.v}${f.u}` : f.v;
}

/** Percentage delta from prior → current, null when the prior period is empty. */
function deltaPct(current: number, previous: number): number | undefined {
  if (previous <= 0) return current > 0 ? 100 : undefined;
  return Math.round(((current - previous) / previous) * 100);
}

type Props = { personal: DashboardData['personal']; period: StatsPeriod };

/**
 * Your-reading-stats card: four StatTiles (time, units, finished, streak) with
 * period-over-period deltas, plus a weekly bar chart (week range) or a 12-week
 * trend line (longer ranges). A zero period renders the real chart at zero.
 */
export function PersonalWidget({ personal, period }: Props): React.JSX.Element {
  const { current, previous, distribution, trend, favType } = personal;
  const mins = fmtMins(current.minutes);
  const units = Math.round(current.units || current.minutes * UNITS_PER_MINUTE);
  const hasData = current.minutes > 0 || current.units > 0 || current.booksFinished > 0;
  const muted = hasData ? undefined : '--color-muted-foreground';

  return (
    <Card fill>
      <CardHead
        icon={Activity}
        title={`Your reading · ${PERIOD_NOTE[period]}`}
        action={
          favType ? (
            <span className="font-mono text-[10.5px] text-muted-foreground">
              fav · {CONTENT_TYPE_LABEL[favType as ContentType]}
            </span>
          ) : undefined
        }
      />
      {/* Container-query grid: the card's width (not the viewport) drives the
          column count, since `personal` is locked at 1.6fr of a fixed two-column
          row. 2-up when the card is cramped, 4-up only once it's wide enough for
          the tiles to breathe — keeps "Finished" / "154 ch/vol" from clipping. */}
      <div className="@container mb-4">
        <div className="grid grid-cols-2 gap-2.5 @xl:grid-cols-4">
        <StatTile
          icon={Clock}
          label="Time read"
          value={mins.v}
          unit={mins.u || undefined}
          accentVar={muted}
          delta={hasData ? deltaPct(current.minutes, previous.minutes) : undefined}
        />
        <StatTile
          icon={BookOpen}
          label="Units"
          value={compactNum(units)}
          unit="ch/vol"
          accentVar={muted}
          delta={hasData ? deltaPct(current.units, previous.units) : undefined}
        />
        <StatTile
          icon={Check}
          label="Finished"
          value={current.booksFinished}
          unit={current.booksFinished === 1 ? 'book' : 'books'}
          accentVar={muted}
          delta={hasData ? deltaPct(current.booksFinished, previous.booksFinished) : undefined}
        />
        <StatTile
          icon={Flame}
          label="Streak"
          value={current.streakDays}
          unit="days"
          accentVar={current.streakDays > 0 ? '--color-warn' : muted}
        />
        </div>
      </div>
      {/* Let the chart absorb the card's slack (Card `fill` is a flex column) so
          it fills a tall cell instead of floating in dead space. min-h keeps it
          reasonable on short cards. */}
      <div className="flex min-h-[120px] flex-1 flex-col">
        {period === 'week' ? (
          <BarWeek values={distribution} valueLabels={distribution.map(minsLabel)} fill />
        ) : (
          <TrendLine
            points={trend}
            labels={TREND_LABELS}
            valueLabels={trend.map(minsLabel)}
            height={120}
          />
        )}
      </div>
      {!hasData && (
        <ZeroCaption>
          No reading logged {PERIOD_NOTE[period]} — start a session to fill this in.
        </ZeroCaption>
      )}
    </Card>
  );
}
