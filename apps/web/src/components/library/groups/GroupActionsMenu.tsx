'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { FolderPlus, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';
import type { GroupNode } from './lib';

/** Shared callbacks fired by both the ellipsis dropdown and the context menu. */
export interface GroupActionHandlers {
  onRename: (group: GroupNode) => void;
  onNewSubgroup: (group: GroupNode) => void;
  onDelete: (group: GroupNode) => void;
}

interface ActionItem {
  key: string;
  label: string;
  Icon: typeof Pencil;
  danger?: boolean;
  run: () => void;
}

/** One source of truth for the menu items so both surfaces stay in sync. */
function actionItems(group: GroupNode, h: GroupActionHandlers): ActionItem[] {
  return [
    { key: 'rename', label: 'Rename', Icon: Pencil, run: () => h.onRename(group) },
    { key: 'subgroup', label: 'New subgroup', Icon: FolderPlus, run: () => h.onNewSubgroup(group) },
    { key: 'delete', label: 'Delete…', Icon: Trash2, danger: true, run: () => h.onDelete(group) },
  ];
}

type MenuButtonProps = GroupActionHandlers & { group: GroupNode };

/**
 * Ellipsis icon button + dropdown for a folder card's `menuSlot`. Uses the
 * design's `.popover` shell (same idiom as SortMenu) — revealed by the
 * card's hover/focus-within `.fmenu` container.
 */
export function GroupMenuButton({
  group,
  onRename,
  onNewSubgroup,
  onDelete,
}: MenuButtonProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const items = actionItems(group, { onRename, onNewSubgroup, onDelete });

  // Outside-click close (capture phase — sibling triggers stopPropagation).
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent): void {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('click', onDocClick, true);
    return () => document.removeEventListener('click', onDocClick, true);
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={cn('fmenu-dd', open && 'open')}
      // Keep Enter/Space/Escape on the menu from triggering the card's
      // role=button keydown navigation.
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
        e.stopPropagation();
      }}
    >
      <button
        type="button"
        className="fmenu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Group actions for ${group.name}`}
        data-testid={`group-menu-${group.id}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <MoreVertical size={16} strokeWidth={1.7} aria-hidden />
      </button>

      {open && (
        <div className="popover fmenu-pop" role="menu" aria-label={`Actions for ${group.name}`}>
          {items.map(({ key, label, Icon, danger, run }) => (
            <Fragment key={key}>
              {danger && <div className="sep" aria-hidden />}
              <button
                type="button"
                role="menuitem"
                className={cn('row', danger && 'danger')}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  run();
                }}
              >
                <Icon size={14} strokeWidth={1.7} aria-hidden />
                <span>{label}</span>
              </button>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

type ContextMenuProps = GroupActionHandlers & {
  group: GroupNode;
  /** The folder card — must forward refs/props (FolderCard does). */
  children: React.ReactNode;
};

/** Right-click context menu wrapping a folder card; same items as the button. */
export function GroupContextMenu({
  group,
  children,
  onRename,
  onNewSubgroup,
  onDelete,
}: ContextMenuProps): React.JSX.Element {
  const items = actionItems(group, { onRename, onNewSubgroup, onDelete });
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {items.map(({ key, label, Icon, danger, run }) => (
          <Fragment key={key}>
            {danger && <ContextMenuSeparator />}
            <ContextMenuItem className={cn(danger && 'text-err focus:text-err')} onSelect={run}>
              <Icon size={14} strokeWidth={1.7} aria-hidden />
              <span>{label}</span>
            </ContextMenuItem>
          </Fragment>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
