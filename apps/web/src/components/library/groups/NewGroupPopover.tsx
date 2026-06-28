'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FolderPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-fetch';
import { displayPath, type GroupNode } from './lib';

type Props = {
  groups: GroupNode[];
  /** Whether the popover is open (state lifted so menus can open it too). */
  open: boolean;
  /** Parent for the new group — `null` = Library root. */
  parentId: number | null;
  /** Control-bar trigger clicked — parent decides the parentId (current path). */
  onTrigger: () => void;
  onOpenChange: (open: boolean) => void;
};

/**
 * "New group" control-bar button + anchored popover (context line, name
 * input, Cancel/Create). One instance is rendered in the library control bar;
 * the folder-card "New subgroup" menu item re-opens it with that group as the
 * parent. Design: docs/design/bookkeeprr-design-system.html ~2556-2570.
 */
export function NewGroupPopover({
  groups,
  open,
  parentId,
  onTrigger,
  onOpenChange,
}: Props): React.JSX.Element {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Fresh form every time the popover opens.
  useEffect(() => {
    if (open) {
      setName('');
      setError(null);
    }
  }, [open]);

  // Outside-click close. Capture phase so sibling triggers that
  // stopPropagation (filter/sort menus) still dismiss this popover.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent): void {
      if (!rootRef.current?.contains(e.target as Node)) onOpenChange(false);
    }
    document.addEventListener('click', onDocClick, true);
    return () => document.removeEventListener('click', onDocClick, true);
  }, [open, onOpenChange]);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch('/api/library/groups', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // The create contract takes `parentId` only for subgroups — root
        // creates OMIT the field (`null` is rejected; that spelling is
        // reserved for PATCH's "move to root").
        body: JSON.stringify({ name: trimmed, ...(parentId !== null && { parentId }) }),
      });
      if (r.status === 409) {
        setError('A group with this name already exists here.');
        return;
      }
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(body.message ?? body.error ?? `HTTP ${r.status}`);
      }
      toast.success(`Created "${trimmed}"`);
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create group');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={rootRef} className="lib-newgroup">
      <button
        type="button"
        className="filter-trigger"
        onClick={(e) => {
          e.stopPropagation();
          onTrigger();
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="New group"
        data-testid="new-group-btn"
      >
        <FolderPlus width={15} height={15} strokeWidth={1.7} aria-hidden />
        <span className="ft-label">New group</span>
      </button>

      {open && (
        <form
          className="popover ng-pop"
          onSubmit={submit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onOpenChange(false);
          }}
        >
          <div className="ng-in">In · {displayPath(groups, parentId) || 'Library root'}</div>
          <input
            className="ng-input"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            placeholder="Group name — e.g. Engineering"
            maxLength={40}
            autoFocus
            aria-label="Group name"
            data-testid="new-group-input"
          />
          {error && <div className="ng-err">{error}</div>}
          <div className="ng-row">
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={name.trim().length === 0 || busy}
              data-testid="new-group-create"
            >
              {busy ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
