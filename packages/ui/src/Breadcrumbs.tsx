'use client';

import { cn } from './utils';
import type { ContentType } from '@bookkeeprr/types';

export type BreadcrumbItem = {
  label: React.ReactNode;
  href?: string;
  current?: boolean;
  contentType?: ContentType;
  icon?: 'home' | 'cog' | React.ReactNode;
};

export type BreadcrumbsProps = {
  items: BreadcrumbItem[];
  variant?: 'default' | 'plain' | 'mono';
  collapsedFrom?: number;
  onExpand?: () => void;
  className?: string;
};

const TYPE_VAR: Record<ContentType, string> = {
  manga: '--color-manga',
  comic: '--color-comic',
  light_novel: '--color-novel',
  ebook: '--color-ebook',
  audiobook: '--color-audio',
};

function HomeIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l9-8 9 8M5 10v10h14V10" />
    </svg>
  );
}

function CogIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 1 1-7-7" />
    </svg>
  );
}

function ChevronIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function resolveIcon(icon: BreadcrumbItem['icon']): React.ReactNode {
  if (icon === 'home') return <HomeIcon />;
  if (icon === 'cog') return <CogIcon />;
  return icon ?? null;
}

/**
 * Breadcrumb trail — see §14 in `docs/design/bookkeeprr-design-system.html`.
 *
 * Items render left-to-right with chevron separators. The last item is the
 * current page — bold, unlinked, never truncated. When `collapsedFrom` is
 * set, the middle items hide behind a `…` button between item[0] and
 * item[items.length - collapsedFrom]; clicking the button fires `onExpand`.
 *
 * Variants:
 * - `default` — pill bg + border (used in the TopBar and most pages).
 * - `plain` — no pill, inline trail.
 * - `mono` — uppercase mono labels (use for inline schedule lines like
 *   `Calendar / May 14, 2026`).
 */
export function Breadcrumbs({
  items,
  variant = 'default',
  collapsedFrom,
  onExpand,
  className,
}: BreadcrumbsProps): React.JSX.Element {
  const displayItems: Array<{ item: BreadcrumbItem; isCollapsed?: false } | { item: null; isCollapsed: true }> = [];
  if (collapsedFrom && items.length > collapsedFrom + 1) {
    displayItems.push({ item: items[0]! });
    displayItems.push({ item: null, isCollapsed: true });
    for (let i = items.length - collapsedFrom; i < items.length; i++) {
      displayItems.push({ item: items[i]! });
    }
  } else {
    items.forEach((item) => displayItems.push({ item }));
  }

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn('bc', variant === 'plain' && 'plain', variant === 'mono' && 'mono', className)}
    >
      {displayItems.map((entry, idx) => {
        const isLast = idx === displayItems.length - 1;
        if (entry.isCollapsed) {
          return (
            <span key={`gap-${idx}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              <button type="button" className="collapse" onClick={onExpand} aria-label="Expand hidden crumbs">
                …
              </button>
              {!isLast && (
                <span className="sep">
                  <ChevronIcon />
                </span>
              )}
            </span>
          );
        }
        const item = entry.item;
        const isCurrent = item.current || isLast;
        const isHome = item.icon === 'home';
        const inner: React.ReactNode = (
          <>
            {resolveIcon(item.icon)}
            {item.contentType && (
              <span
                className="ctype"
                style={{ background: `var(${TYPE_VAR[item.contentType]})` }}
                aria-hidden
              />
            )}
            <span>{item.label}</span>
          </>
        );
        const crumbClass = cn('crumb', isHome && 'home', isCurrent && 'current');
        return (
          <span key={`c-${idx}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            {isCurrent || !item.href ? (
              <span className={crumbClass}>{inner}</span>
            ) : (
              <a className={crumbClass} href={item.href}>
                {inner}
              </a>
            )}
            {!isLast && (
              <span className="sep">
                <ChevronIcon />
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
