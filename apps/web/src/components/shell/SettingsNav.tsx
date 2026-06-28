'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { SETTINGS_NAV, activeSettingsHref } from './settings-nav';
import { CLOUD_FEATURES_ENABLED } from '@/lib/features';

/**
 * Settings left rail — grouped categories with an active accent bar, matching
 * the design system's `.set-nav`. Renders inside the settings 2-column shell.
 */
export function SettingsNav(): React.JSX.Element {
  const pathname = usePathname() ?? '';
  const active = activeSettingsHref(pathname);

  return (
    <nav aria-label="Settings sections" className="flex flex-col gap-1">
      {SETTINGS_NAV.map((group) => {
        const items = group.items.filter((item) => CLOUD_FEATURES_ENABLED || !item.hidden);
        if (items.length === 0) return null;
        return (
        <div key={group.label} className="flex flex-col gap-0.5">
          <div className="px-3 pb-1.5 pt-3.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {group.label}
          </div>
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'relative flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors',
                  isActive
                    ? 'bg-[color-mix(in_oklab,var(--color-primary)_16%,transparent)] text-primary before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary before:content-[""]'
                    : 'text-foreground/80 hover:bg-hover hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
        );
      })}
    </nav>
  );
}
