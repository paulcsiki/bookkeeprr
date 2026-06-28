'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import type { GroupNode } from './lib';

type Props = {
  group: GroupNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Small rename dialog — same name rules as create; 409 shown inline. */
export function RenameGroupDialog({ group, open, onOpenChange }: Props): React.JSX.Element {
  const router = useRouter();
  const [name, setName] = useState(group.name);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Re-prefill whenever the dialog opens (possibly for a different group).
  useEffect(() => {
    if (open) {
      setName(group.name);
      setError(null);
    }
  }, [open, group]);

  const trimmed = name.trim();

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (trimmed.length === 0 || busy) return;
    if (trimmed === group.name) {
      onOpenChange(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch(`/api/library/groups/${group.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (r.status === 409) {
        setError('A group with this name already exists here.');
        return;
      }
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(body.message ?? body.error ?? `HTTP ${r.status}`);
      }
      toast.success(`Renamed to "${trimmed}"`);
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to rename group');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display">Rename group</DialogTitle>
          <DialogDescription>
            Folders on disk re-route on the next rename pass.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-2">
          <input
            className="ng-input"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            maxLength={40}
            autoFocus
            aria-label="Group name"
            data-testid="rename-group-input"
          />
          {error && <div className="ng-err">{error}</div>}
          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={trimmed.length === 0 || trimmed === group.name || busy}
              data-testid="rename-group-save"
            >
              {busy ? 'Renaming…' : 'Rename'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
