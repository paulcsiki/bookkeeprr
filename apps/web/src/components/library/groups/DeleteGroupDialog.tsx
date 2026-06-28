'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiFetch } from '@/lib/api-fetch';
import { descendantGroupIds, type GroupNode } from './lib';

type Props = {
  group: GroupNode;
  /** The full group list, for the recursive subtree count. */
  groups: GroupNode[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired after a successful DELETE — the parent navigates + refreshes. */
  onDeleted: (group: GroupNode) => void;
};

function plural(n: number, word: string): string {
  return `${n} ${n === 1 ? word : `${word}s`}`;
}

/**
 * Recursive-cascade delete confirmation. Content-bearing groups (any series
 * or subgroups underneath) require typing the group's exact name before the
 * destructive button arms; empty leaves get a plain confirm.
 */
export function DeleteGroupDialog({
  group,
  groups,
  open,
  onOpenChange,
  onDeleted,
}: Props): React.JSX.Element {
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);

  // N includes the group itself; M is the recursive series count.
  const groupCount = useMemo(() => descendantGroupIds(groups, group.id).size, [groups, group.id]);
  const seriesCount = group.seriesCount;
  const needsConfirm = seriesCount > 0 || groupCount > 1;
  const armed = !needsConfirm || confirmText === group.name;

  useEffect(() => {
    if (open) setConfirmText('');
  }, [open, group]);

  async function confirmDelete(): Promise<void> {
    if (!armed || busy) return;
    setBusy(true);
    try {
      const r = await apiFetch(`/api/library/groups/${group.id}`, { method: 'DELETE' });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(body.message ?? body.error ?? `HTTP ${r.status}`);
      }
      const body = (await r.json()) as { deletedGroups: number; deletedSeries: number };
      toast.success(
        `Deleted ${plural(body.deletedGroups, 'group')} · ${body.deletedSeries} series`,
      );
      onOpenChange(false);
      onDeleted(group);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete group');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display">Delete “{group.name}”?</DialogTitle>
          <DialogDescription>
            This deletes <strong className="font-semibold text-foreground">{plural(groupCount, 'group')}</strong> and{' '}
            <strong className="font-semibold text-foreground">{seriesCount} series</strong> from
            your library. Files on disk are untouched.
          </DialogDescription>
        </DialogHeader>
        {needsConfirm && (
          <div className="space-y-2">
            <label
              className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
              htmlFor="delete-group-confirm"
            >
              Type the group&apos;s name to confirm
            </label>
            <input
              id="delete-group-confirm"
              className="ng-input"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={group.name}
              autoFocus
              data-testid="delete-group-confirm-input"
            />
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={!armed || busy}
            onClick={() => void confirmDelete()}
            data-testid="delete-group-confirm-btn"
          >
            {busy ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
