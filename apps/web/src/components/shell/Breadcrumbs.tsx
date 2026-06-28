'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Breadcrumbs as BreadcrumbsPrimitive, type BreadcrumbItem } from '@bookkeeprr/ui';
import { SETTINGS_LABELS } from './settings-nav';
import { ACCOUNT_LABELS } from './account-nav';
import { useBreadcrumbLabels } from './BreadcrumbLabels';

const TOP_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  library: 'Library',
  discover: 'Discover',
  add: 'Add',
  calendar: 'Calendar',
  activity: 'Activity',
  settings: 'Settings',
  account: 'Account',
  import: 'Import',
  replays: 'Replays',
  connect: 'Connect',
  series: 'Series',
  profile: 'Profile',
};

function buildItems(pathname: string, overrides: Record<string, string>): BreadcrumbItem[] {
  const segments = pathname.split('/').filter(Boolean);
  const items: BreadcrumbItem[] = [{ label: 'Home', href: '/dashboard', icon: 'home' }];
  let href = '';
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    href += `/${seg}`;
    const label =
      overrides[href] ??
      SETTINGS_LABELS[href] ??
      ACCOUNT_LABELS[href] ??
      TOP_LABELS[seg] ??
      decodeURIComponent(seg).replace(/[-_]/g, ' ');
    items.push({ label, href, current: i === segments.length - 1 });
  }
  return items;
}

/**
 * Route-aware breadcrumbs for the top bar. Thin wrapper around the
 * <Breadcrumbs> primitive from @bookkeeprr/ui — builds items from the current
 * pathname and renders the default (pill) variant.
 */
export function Breadcrumbs(): React.JSX.Element | null {
  const pathname = usePathname() ?? '';
  const overrides = useBreadcrumbLabels();
  const items = buildItems(pathname, overrides);

  // Keep the browser tab title in sync with the current page: "<page> · bookkeeprr".
  // Derives from the deepest crumb, so it reflects the dynamic series name too.
  const current = items[items.length - 1]?.label;
  useEffect(() => {
    document.title = current ? `${current} · bookkeeprr` : 'bookkeeprr';
  }, [current]);

  if (items.length <= 1) return null;
  return <BreadcrumbsPrimitive items={items} />;
}
