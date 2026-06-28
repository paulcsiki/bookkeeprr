'use client';

import { forwardRef, useState } from 'react';
import { Folder } from 'lucide-react';
import { hueGradient } from '@/app/(app)/discover/hue-gradient';
import { proxiedSrc } from '@/components/Cover';
import { cn } from '@/lib/utils';
import type { GroupNode } from './lib';

/**
 * Native HTML5 drag-and-drop handlers, supplied by the parent (the card is
 * purely presentational). Default `Element` generic so the same shape spreads
 * onto both the folder card div and the breadcrumb buttons.
 */
export interface DropHandlers {
  onDragOver: React.DragEventHandler;
  onDragLeave: React.DragEventHandler;
  onDrop: React.DragEventHandler;
}

/** One small cover in the folder's fan. `seed` drives the solid gradient fallback. */
export interface FanCover {
  coverUrl: string | null;
  seed: number;
}

type Props = {
  group: GroupNode;
  /** Up to 3 recursive member covers for the fan (extra entries are ignored). */
  fanCovers: FanCover[];
  onOpen: (id: number) => void;
  dropState: 'idle' | 'hot';
  /** Spread onto the card so it acts as a drop target. */
  dropHandlers?: DropHandlers;
  /** Ellipsis / context-menu trigger — revealed on hover/focus-within. */
  menuSlot?: React.ReactNode;
  testId?: string;
} & React.HTMLAttributes<HTMLDivElement>;

/** A single fanned cover: solid hue gradient underneath, image on top. */
function Fan({ coverUrl, seed }: FanCover): React.JSX.Element {
  const [failed, setFailed] = useState(false);
  const src = proxiedSrc(coverUrl);
  const hue = ((seed % 360) + 360) % 360;
  return (
    <span className="fan" style={{ background: hueGradient(hue) }}>
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : null}
    </span>
  );
}

/**
 * Folder card — a group rendered in the library grid, occupying the exact
 * same grid-cell footprint as a `SeriesCard` (2/3-aspect surface + meta).
 * Matches the design's `.lib-folder` pattern: folder glyph top-left, fan of
 * up to 3 member covers, drop-hot state with dashed primary border + solid
 * soft background + "Drop to move here" hint.
 * Token reference: docs/design/bookkeeprr-design-system.html ~636-705, ~6740.
 *
 * Forwards refs + extra div props so it can be a Radix `asChild` trigger
 * (the group context menu wraps it).
 */
export const FolderCard = forwardRef<HTMLDivElement, Props>(function FolderCard(
  { group, fanCovers, onOpen, dropState, dropHandlers, menuSlot, testId, className, ...rest },
  ref,
): React.JSX.Element {
  const folders =
    group.subgroupCount > 0
      ? `${group.subgroupCount} ${group.subgroupCount === 1 ? 'folder' : 'folders'} · `
      : '';
  const counts = `${folders}${group.seriesCount} series`;

  return (
    <div
      ref={ref}
      {...rest}
      className={cn('lib-folder', dropState === 'hot' && 'drop-hot', className)}
      role="button"
      tabIndex={0}
      aria-label={`Open group ${group.name}`}
      data-testid={testId}
      onClick={() => onOpen(group.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(group.id);
        }
      }}
      {...dropHandlers}
    >
      {/* Folder surface — same 2/3 aspect as a series cover */}
      <div className="fv">
        <Folder className="tabico" size={15} strokeWidth={1.7} aria-hidden />
        <div className="fan-row">
          {fanCovers.slice(0, 3).map((c, i) => (
            <Fan key={i} coverUrl={c.coverUrl} seed={c.seed} />
          ))}
        </div>
        <div className="drop-hint">Drop to move here</div>
        {menuSlot ? (
          <div className="fmenu" onClick={(e) => e.stopPropagation()}>
            {menuSlot}
          </div>
        ) : null}
      </div>

      {/* Meta — name + recursive counts */}
      <div className="meta">
        <div className="title" title={group.name}>
          {group.name}
        </div>
        <div className="sub">{counts.toUpperCase()}</div>
      </div>
    </div>
  );
});
