'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ContentType } from '@/server/content-type';
import { AddDialog } from './AddDialog';

export type OpenAddDialogOptions = {
  /** Pre-populate the search input with this query. */
  query?: string;
  /** Pre-select a content-type filter chip. */
  contentType?: ContentType;
};

type AddDialogContextValue = {
  isOpen: boolean;
  open: (opts?: OpenAddDialogOptions) => void;
  close: () => void;
};

const AddDialogContext = createContext<AddDialogContextValue | null>(null);

/**
 * Provides the global "Add to library" dialog. Any descendant can call
 * `useAddDialog().open()` to launch the search-driven add flow. The dialog
 * itself is rendered once here, controlled by this provider's state.
 *
 * `open()` accepts an optional `{ query, contentType }` object to pre-populate
 * the search input and pre-select a content-type filter when opening from a
 * context where the target is already known (e.g. missing-book Add button on
 * the series page). All existing callers that call `open()` with no args are
 * unaffected.
 */
export function AddDialogProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [initialOpts, setInitialOpts] = useState<OpenAddDialogOptions | undefined>(undefined);

  const open = useCallback((opts?: OpenAddDialogOptions) => {
    setInitialOpts(opts);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const value = useMemo<AddDialogContextValue>(
    () => ({ isOpen, open, close }),
    [isOpen, open, close],
  );

  return (
    <AddDialogContext.Provider value={value}>
      {children}
      <AddDialog open={isOpen} onOpenChange={setIsOpen} initialOpts={initialOpts} />
    </AddDialogContext.Provider>
  );
}

export function useAddDialog(): AddDialogContextValue {
  const ctx = useContext(AddDialogContext);
  if (ctx === null) {
    throw new Error('useAddDialog must be used within an <AddDialogProvider>');
  }
  return ctx;
}
