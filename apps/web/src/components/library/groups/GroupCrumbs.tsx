'use client';

import { Fragment } from 'react';
import { Folder } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DropHandlers } from './FolderCard';
import type { GroupNode } from './lib';

type Props = {
  /** Root-first chain of the currently open group (from `crumbChain`). */
  chain: GroupNode[];
  /** `null` navigates to the library root. */
  onNavigate: (id: number | null) => void;
  /**
   * Which crumb is the hot drop target: `'root'` for the Library crumb,
   * a group id for a chain crumb, `null`/`undefined` for none.
   */
  dropHotId?: number | null | 'root';
  /** Drop handlers per crumb target (`null` = the Library root crumb). */
  dropHandlersFor?: (target: number | null) => DropHandlers;
};

/**
 * Breadcrumb trail for the grouped library — "Library / Parent / Current".
 * The current (last) crumb is plain text; every other crumb navigates on
 * click and doubles as a drop target with the dashed-primary hot treatment.
 * Token reference: docs/design/bookkeeprr-design-system.html ~6931 + .lib-crumbs CSS.
 */
export function GroupCrumbs({
  chain,
  onNavigate,
  dropHotId,
  dropHandlersFor,
}: Props): React.JSX.Element {
  return (
    <nav className="lib-crumbs" aria-label="Library groups" data-testid="group-crumbs">
      <button
        type="button"
        className={cn('crumb', dropHotId === 'root' && 'drop-hot')}
        onClick={() => onNavigate(null)}
        {...dropHandlersFor?.(null)}
      >
        Library
      </button>

      {chain.map((g, i) => {
        const last = i === chain.length - 1;
        return (
          <Fragment key={g.id}>
            <span className="sep" aria-hidden>
              /
            </span>
            {last ? (
              <span className="crumb current" aria-current="location">
                <Folder size={13} strokeWidth={1.7} aria-hidden />
                {g.name}
              </span>
            ) : (
              <button
                type="button"
                className={cn('crumb', dropHotId === g.id && 'drop-hot')}
                onClick={() => onNavigate(g.id)}
                {...dropHandlersFor?.(g.id)}
              >
                <Folder size={13} strokeWidth={1.7} aria-hidden />
                {g.name}
              </button>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
