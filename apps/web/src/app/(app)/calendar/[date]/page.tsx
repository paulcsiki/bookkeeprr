import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Breadcrumbs } from '@bookkeeprr/ui';
import { listCalendarEntries } from '@/server/db/calendar';
import { Button } from '@/components/ui/button';
import { DayDetail } from './DayDetail';
import { addDaysUtc, formatDayHeading, formatDayShort, monthKey, parseYmd } from '../lib';

export const dynamic = 'force-dynamic';

type Params = Promise<{ date: string }>;

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function CalendarDayPage({
  params,
}: {
  params: Params;
}): Promise<React.JSX.Element> {
  const { date } = await params;
  if (!YMD_RE.test(date)) notFound();
  const dayDate = parseYmd(date);
  if (Number.isNaN(dayDate.getTime())) notFound();

  // ±60 days window — enough to find adjacent release days even on a sparse calendar.
  const windowDays = 60;
  const from = addDaysUtc(dayDate, -windowDays);
  const to = addDaysUtc(dayDate, windowDays + 1);
  const entries = await listCalendarEntries(from, to);

  const dayEntries = entries.filter((e) => e.date === date);
  const allDays = Array.from(new Set(entries.map((e) => e.date))).sort();
  const prevDay = allDays.filter((d) => d < date).pop() ?? null;
  const nextDay = allDays.find((d) => d > date) ?? null;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {/* Head */}
        <div
          className="border-b border-border px-7 py-6"
          style={{
            backgroundImage:
              'linear-gradient(180deg, color-mix(in oklab, var(--color-primary) 6%, transparent), transparent)',
          }}
        >
          <Breadcrumbs
            variant="mono"
            items={[
              { label: 'Calendar', href: `/calendar?month=${monthKey(dayDate)}` },
              {
                label: dayDate.toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                  timeZone: 'UTC',
                }),
                current: true,
              },
            ]}
            className="mb-2"
          />
          <div className="flex items-baseline gap-4 font-display text-3xl font-semibold tracking-tight leading-none">
            {formatDayHeading(dayDate)}
            <span className="font-mono text-[13px] font-medium tracking-[0.04em] text-primary">
              {dayEntries.length} RELEASE{dayEntries.length === 1 ? '' : 'S'}
            </span>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3.5">
            <DayNavButton dir="prev" target={prevDay} />
            <Link
              href={{ pathname: '/calendar', query: { month: monthKey(dayDate) } }}
              className="font-mono text-[11px] tracking-[0.06em] text-muted-foreground hover:text-primary"
            >
              Back to {monthKey(dayDate)}
            </Link>
            <DayNavButton dir="next" target={nextDay} />
          </div>
        </div>

        <DayDetail entries={dayEntries} />
      </div>
    </div>
  );
}

function DayNavButton({
  dir,
  target,
}: {
  dir: 'prev' | 'next';
  target: string | null;
}): React.JSX.Element {
  const labelText = dir === 'prev' ? 'Previous release day' : 'Next release day';
  if (!target) {
    return (
      <Button variant="outline" size="sm" disabled className="opacity-40">
        {dir === 'prev' ? <ChevronLeft className="h-3.5 w-3.5" /> : null}
        <span className="flex flex-col text-left leading-tight">
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            {labelText}
          </span>
          <span className="font-display font-medium">None</span>
        </span>
        {dir === 'next' ? <ChevronRight className="h-3.5 w-3.5" /> : null}
      </Button>
    );
  }
  const targetDate = parseYmd(target);
  return (
    <Button asChild variant="outline" size="sm">
      <Link href={`/calendar/${target}` as const}>
        {dir === 'prev' ? <ChevronLeft className="h-3.5 w-3.5" /> : null}
        <span
          className={`flex flex-col leading-tight ${dir === 'prev' ? 'text-left' : 'text-right'}`}
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            {labelText}
          </span>
          <span className="font-display font-medium">{formatDayShort(targetDate)}</span>
        </span>
        {dir === 'next' ? <ChevronRight className="h-3.5 w-3.5" /> : null}
      </Link>
    </Button>
  );
}
