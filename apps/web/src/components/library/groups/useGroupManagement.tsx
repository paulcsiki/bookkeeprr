'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DeleteGroupDialog } from './DeleteGroupDialog';
import { NewGroupPopover } from './NewGroupPopover';
import { RenameGroupDialog } from './RenameGroupDialog';
import { descendantGroupIds, type GroupNode } from './lib';

interface UseGroupManagementInput {
  /** The currently-open group id (null = library root). */
  path: number | null;
  /** Full group list from the server. */
  groups: GroupNode[];
  /** Navigate to a group (null = root). */
  gotoGroup: (id: number | null) => void;
}

interface GroupActions {
  onRename: (g: GroupNode) => void;
  onNewSubgroup: (g: GroupNode) => void;
  onDelete: (g: GroupNode) => void;
}

interface UseGroupManagementResult {
  /** Action callbacks to spread onto GroupContextMenu / GroupMenuButton. */
  groupActions: GroupActions;
  /**
   * The NewGroupPopover button + anchored popover — render in the
   * `newGroupSlot` prop of LibraryControlBar so it sits inside the filter bar.
   */
  newGroupSlot: React.ReactNode;
  /**
   * The two always-mounted dialogs (rename + delete). Render as siblings of
   * LibraryControlBar, anywhere in the tree — Radix portals them to body.
   *
   * Always mounting both dialogs means Radix sees the open→false transition
   * and plays the close animation. A `lastTarget` ref keeps the previous
   * group's data stable while the dialog animates out.
   */
  dialogs: React.ReactNode;
}

const EMPTY_GROUP: GroupNode = {
  id: 0,
  name: '',
  parentId: null,
  path: '',
  seriesCount: 0,
  subgroupCount: 0,
};

/**
 * Encapsulates create / rename / delete state and the three overlay renders
 * so LibraryView stays lean. Returns `newGroupSlot` (the popover trigger +
 * form, for LibraryControlBar's filter bar) and `dialogs` (the two
 * always-mounted Radix dialogs, renderable as siblings anywhere).
 */
export function useGroupManagement({
  path,
  groups,
  gotoGroup,
}: UseGroupManagementInput): UseGroupManagementResult {
  const router = useRouter();

  // New-group popover state
  const [newGroup, setNewGroup] = useState<{ open: boolean; parentId: number | null }>({
    open: false,
    parentId: null,
  });

  // Rename dialog — null means closed
  const [renameTarget, setRenameTarget] = useState<GroupNode | null>(null);
  // Keep last non-null value so dialog content stays stable during the close animation
  const lastRenameTarget = useRef<GroupNode | null>(null);
  if (renameTarget !== null) lastRenameTarget.current = renameTarget;

  // Delete dialog — null means closed
  const [deleteTarget, setDeleteTarget] = useState<GroupNode | null>(null);
  // Keep last non-null value so dialog content stays stable during the close animation
  const lastDeleteTarget = useRef<GroupNode | null>(null);
  if (deleteTarget !== null) lastDeleteTarget.current = deleteTarget;

  const groupActions: GroupActions = {
    onRename: (g) => setRenameTarget(g),
    onNewSubgroup: (g) => setNewGroup({ open: true, parentId: g.id }),
    onDelete: (g) => setDeleteTarget(g),
  };

  /** After a cascade delete: leave the deleted subtree if we were inside it. */
  function onGroupDeleted(g: GroupNode): void {
    if (path !== null && descendantGroupIds(groups, g.id).has(path)) gotoGroup(g.parentId);
    router.refresh();
  }

  const newGroupSlot = (
    <NewGroupPopover
      groups={groups}
      open={newGroup.open}
      parentId={newGroup.parentId}
      onTrigger={() =>
        setNewGroup((s) => (s.open ? { ...s, open: false } : { open: true, parentId: path }))
      }
      onOpenChange={(open) => setNewGroup((s) => ({ ...s, open }))}
    />
  );

  const dialogs = (
    <>
      {/* Always mounted — Radix sees open→false and plays the close animation. */}
      {/* lastRenameTarget.current keeps content stable while animating out.  */}
      <RenameGroupDialog
        group={lastRenameTarget.current ?? EMPTY_GROUP}
        open={renameTarget !== null}
        onOpenChange={(o) => {
          if (!o) setRenameTarget(null);
        }}
      />
      {/* Always mounted — same always-mounted pattern as rename. */}
      <DeleteGroupDialog
        group={lastDeleteTarget.current ?? EMPTY_GROUP}
        groups={groups}
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
        onDeleted={onGroupDeleted}
      />
    </>
  );

  return { groupActions, newGroupSlot, dialogs };
}
