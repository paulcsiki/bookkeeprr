import { listCalendarEntries } from '@/server/db/calendar';
import { PageHeader } from '@/components/shell/PageHeader';
import { MonthGrid } from './MonthGrid';
import {
  addMonthsUtc,
  monthGridDays,
  monthKey,
  parseMonthKey,
  startOfMonthUtc,
  todayUtc,
} from './lib';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ month?: string }>;

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<React.JSX.Element> {
  const { month } = await searchParams;
  const monthStart = month ? parseMonthKey(month) : startOfMonthUtc(todayUtc());
  const days = monthGridDays(monthStart);
  const from = days[0]!;
  // exclusive upper bound = day after last grid cell
  const to = new Date(days[41]!.getTime() + 24 * 60 * 60 * 1000);
  const entries = await listCalendarEntries(from, to);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendar"
        subtitle="Upcoming releases for your monitored series."
        actions={
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            {monthKey(addMonthsUtc(monthStart, 0))}
          </span>
        }
      />
      <MonthGrid entries={entries} monthIso={monthKey(monthStart)} />
    </div>
  );
}
