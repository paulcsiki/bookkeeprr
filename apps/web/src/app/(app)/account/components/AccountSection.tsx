import { cn } from '@/lib/utils';

/** Per-page section header for the account routes: a full-width title + lede
 *  over a divider, then the section content below. Matches the set-head style
 *  used by ProfileSection so every account page reads consistently.
 *
 *  `fill` makes the section claim the full height of the scrolling content
 *  pane: the header stays pinned and the children area becomes a flex region
 *  (`flex-1 min-h-0`) so a child can scroll internally instead of growing the
 *  page. Used by the Active sessions page so only its table scrolls. */
export function AccountSection({
  title,
  desc,
  children,
  fill = false,
}: {
  title: string;
  desc: React.ReactNode;
  children: React.ReactNode;
  fill?: boolean;
}): React.JSX.Element {
  return (
    <div className={cn(fill && 'flex h-full min-h-0 flex-col')}>
      <div className="border-b border-border pb-5">
        <h2 className="font-display text-2xl font-semibold tracking-[-0.02em] text-foreground">{title}</h2>
        <p className="mt-1.5 max-w-[540px] text-sm leading-relaxed text-muted-foreground">{desc}</p>
      </div>
      <div className={cn('pt-7', fill && 'flex min-h-0 flex-1 flex-col')}>{children}</div>
    </div>
  );
}
