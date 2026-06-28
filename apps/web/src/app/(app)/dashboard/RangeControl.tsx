'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Segmented } from '@/components/dashboard';
import type { StatsPeriod } from '@/server/db/reading-stats-agg';

const OPTIONS: { value: StatsPeriod; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
  { value: 'all', label: 'All time' },
];

/**
 * The Stats-range Segmented control. A thin client island: changing the range
 * pushes `?range=` (replace, scroll preserved) so the server page re-fetches
 * every stat widget for the new period.
 */
export function RangeControl({ value }: { value: StatsPeriod }): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const onChange = (next: StatsPeriod): void => {
    const sp = new URLSearchParams(params.toString());
    if (next === 'week') sp.delete('range');
    else sp.set('range', next);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <Segmented options={OPTIONS} value={value} onChange={onChange} aria-label="Stats range" />
  );
}
