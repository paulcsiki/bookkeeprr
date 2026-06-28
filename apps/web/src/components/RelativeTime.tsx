'use client';

import { useEffect, useState } from 'react';

/**
 * Compact "time ago" label with the exact local datetime on hover. Renders a
 * relative string (e.g. "5 minutes ago", "yesterday") and exposes the precise
 * local time via the native `title` tooltip + a `<time dateTime>` for a11y.
 *
 * Relative + local-formatted values are computed on the client (in an effect) to
 * avoid SSR/locale/timezone hydration mismatches; a neutral placeholder renders
 * until mounted. The label refreshes once a minute so it stays current.
 */
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
  ['second', 1],
];

function relativeLabel(from: Date, now: Date): string {
  const seconds = Math.round((now.getTime() - from.getTime()) / 1000);
  if (Math.abs(seconds) < 5) return 'just now';
  const fmt = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [unit, secs] of UNITS) {
    if (Math.abs(seconds) >= secs || unit === 'second') {
      return fmt.format(-Math.round(seconds / secs), unit);
    }
  }
  return 'just now';
}

type Props = {
  /** ISO string, epoch ms, or Date. */
  date: string | number | Date;
  className?: string;
};

export function RelativeTime({ date, className }: Props): React.JSX.Element {
  const iso = new Date(date).toISOString();
  const [text, setText] = useState<{ rel: string; exact: string }>({ rel: '', exact: iso });

  useEffect(() => {
    const d = new Date(date);
    const update = (): void => setText({ rel: relativeLabel(d, new Date()), exact: d.toLocaleString() });
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [date]);

  return (
    <time dateTime={iso} title={text.exact} className={className} suppressHydrationWarning>
      {text.rel || '…'}
    </time>
  );
}
