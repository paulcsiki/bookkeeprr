'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ACCOUNT_NAV } from '@/components/shell/account-nav';

/** Account left rail — flat list of section routes with an active accent bar,
 *  mirroring the settings nav. Renders inside the account 2-column shell. */
export function AccountNav(): React.JSX.Element {
  const pathname = usePathname() ?? '';

  return (
    <nav aria-label="Account sections" className="flex flex-col gap-0.5">
      {ACCOUNT_NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors',
              active
                ? 'bg-primary/10 font-medium text-primary before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-primary before:content-[""]'
                : 'text-foreground/80 hover:bg-muted',
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" /> {label}
          </Link>
        );
      })}
    </nav>
  );
}
