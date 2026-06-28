'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, BookOpen, Calendar, Compass, Activity, Settings, FileCode2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/Logo';
import { VersionPill } from '@/components/VersionPill';

const items = [
  { href: '/dashboard', label: 'Dashboard', icon: Home },
  { href: '/library', label: 'Library', icon: BookOpen },
  { href: '/discover', label: 'Discover', icon: Compass },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/activity', label: 'Activity', icon: Activity },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

export function Sidebar(): React.JSX.Element {
  const pathname = usePathname();
  return (
    <aside className="flex h-screen w-56 flex-col border-r border-border bg-card">
      <div className="px-2 py-4">
        <Link
          href="/dashboard"
          aria-label="Go to Dashboard"
          title="Go to Dashboard"
          className="flex w-full items-center rounded-lg px-3 py-2.5 transition-colors hover:bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
        >
          <Logo size={24} />
        </Link>
      </div>
      <nav className="flex-1 space-y-1 px-2">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-3 py-2 text-[13.5px] transition-colors',
                active
                  ? 'bg-[color-mix(in_oklab,var(--color-primary)_16%,transparent)] text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border px-2 py-3 mt-auto space-y-1">
        <a
          href="/docs/api"
          target="_blank"
          rel="noopener"
          className="flex items-center gap-2.5 rounded-md px-3 py-2 text-[13.5px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <FileCode2 className="h-4 w-4" />
          <span className="flex-1">API reference</span>
        </a>
        <VersionPill />
      </div>
    </aside>
  );
}
