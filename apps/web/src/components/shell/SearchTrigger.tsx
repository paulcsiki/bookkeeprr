'use client';

import { useEffect } from 'react';
import { Search } from 'lucide-react';
import { useAddDialog } from '@/components/add/AddDialogProvider';

/**
 * Top-bar search affordance. Looks like a search box but is a button: clicking
 * opens the "Add to library" dialog — you can't type here, the typing happens in
 * the modal. ⌘K / Ctrl+K opens it from anywhere.
 */
export function SearchTrigger(): React.JSX.Element {
  const { open } = useAddDialog();

  // Global ⌘K / Ctrl+K shortcut. Safe to always intercept — it never conflicts
  // with a plain typing context the way a bare key would.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        open();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <button
      type="button"
      onClick={() => open()}
      aria-label="Search to add to your library"
      className="flex h-9 w-[240px] items-center gap-2 rounded-md border border-border bg-card px-3 text-sm text-muted-foreground transition-colors hover:bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
    >
      <Search className="h-4 w-4 shrink-0" />
      <span className="flex-1 text-left">Search</span>
      <span className="flex items-center gap-0.5 rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
        <span>⌘</span>
        <span>K</span>
      </span>
    </button>
  );
}
