import { Target, Flame } from 'lucide-react';
import { Card, CardHead, ProgressRing, fmtMins } from '@/components/dashboard';
import { WidgetEmpty } from './WidgetEmpty';
import { OpenGoalsButton, EditGoalsButton } from '../../../app/(app)/dashboard/GoalsProvider';
import type { GoalsView } from '../../../app/(app)/dashboard/data';

/**
 * Reading-goals card: a yearly-books ring and a weekly-time ring, plus the
 * current/best streak line. No goals set → the "Set a goal" empty state; a goal
 * set but unmet renders the ring at 0% (a populated, not empty, state).
 */
export function GoalsWidget({ goals }: { goals: GoalsView }): React.JSX.Element {
  const { goals: g, yearBooksDone, weekMinutesDone, streakDays } = goals;
  const hasGoal = g.yearlyBooks != null || g.weeklyMinutes != null || g.streakDays != null;

  if (!hasGoal) {
    return (
      <Card fill>
        <CardHead icon={Target} title="Reading goals" />
        <WidgetEmpty
          variant="primary"
          icon={<Target />}
          title="No goals set"
          body="Set a yearly book count, a weekly time goal, or a reading streak to track your progress."
          action={<OpenGoalsButton />}
          minHeight={196}
        />
      </Card>
    );
  }

  const yearTarget = g.yearlyBooks ?? 0;
  const yearPct = yearTarget > 0 ? Math.round((yearBooksDone / yearTarget) * 100) : 0;
  const weekTarget = g.weeklyMinutes ?? 0;
  const weekPct = weekTarget > 0 ? Math.round((weekMinutesDone / weekTarget) * 100) : 0;
  const year = new Date().getUTCFullYear();

  const streakTarget = g.streakDays ?? 0;
  const streakPct = streakTarget > 0 ? Math.round((streakDays / streakTarget) * 100) : 0;

  return (
    <Card fill>
      <CardHead icon={Target} title="Reading goals" action={<EditGoalsButton />} />
      <div className="flex flex-1 flex-col justify-center gap-[18px]">
        {g.yearlyBooks != null && (
          <div className="flex items-center gap-4">
            <ProgressRing value={yearBooksDone} max={yearTarget} size={92} thickness={9}>
              <div>
                <div className="font-display text-[19px] font-semibold">{yearBooksDone}</div>
                <div className="font-mono text-[8.5px] text-muted-foreground">of {yearTarget}</div>
              </div>
            </ProgressRing>
            <div className="flex-1">
              <div className="text-[13.5px] font-medium text-foreground">{year} books</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {yearPct}% there · {Math.max(0, yearTarget - yearBooksDone)} to go
              </div>
              <div className="mt-2 h-[5px] overflow-hidden rounded-full bg-elevated">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.min(100, yearPct)}%` }}
                />
              </div>
            </div>
          </div>
        )}
        {g.yearlyBooks != null && g.weeklyMinutes != null && <div className="h-px bg-border" />}
        {g.weeklyMinutes != null && (
          <div className="flex items-center gap-4">
            <ProgressRing
              value={weekMinutesDone}
              max={weekTarget}
              size={92}
              thickness={9}
              accentVar="--color-ok"
            >
              <div>
                <div className="font-display text-[18px] font-semibold">{weekPct}%</div>
                <div className="font-mono text-[8.5px] text-muted-foreground">weekly</div>
              </div>
            </ProgressRing>
            <div className="flex-1">
              <div className="text-[13.5px] font-medium text-foreground">Weekly time goal</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {fmtMins(weekMinutesDone).v} of {fmtMins(weekTarget).v}
              </div>
              {g.streakDays == null && (
                <div
                  className="mt-2 flex items-center gap-1.5 font-mono text-[10.5px]"
                  style={{ color: 'var(--color-warn)' }}
                >
                  <Flame className="size-3" aria-hidden /> {streakDays}-day streak
                </div>
              )}
            </div>
          </div>
        )}
        {g.streakDays != null &&
          (g.yearlyBooks != null || g.weeklyMinutes != null) && <div className="h-px bg-border" />}
        {g.streakDays != null && (
          <div className="flex items-center gap-4">
            <ProgressRing
              value={streakDays}
              max={streakTarget}
              size={92}
              thickness={9}
              accentVar="--color-warn"
            >
              <div>
                <div className="font-display text-[19px] font-semibold">{streakDays}</div>
                <div className="font-mono text-[8.5px] text-muted-foreground">days</div>
              </div>
            </ProgressRing>
            <div className="flex-1">
              <div className="flex items-center gap-1.5 text-[13.5px] font-medium text-foreground">
                <Flame className="size-3.5" style={{ color: 'var(--color-warn)' }} aria-hidden />
                Reading streak
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {streakPct}% there · {Math.max(0, streakTarget - streakDays)}-day target left
              </div>
              <div className="mt-2 h-[5px] overflow-hidden rounded-full bg-elevated">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, streakPct)}%`,
                    background: 'var(--color-warn)',
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
