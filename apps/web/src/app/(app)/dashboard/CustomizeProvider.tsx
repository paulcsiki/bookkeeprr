'use client';

import * as React from 'react';
import { Sliders } from 'lucide-react';
import { CustomizeDrawer, type CustomizeDrawerHandle } from './CustomizeDrawer';
import type { DashboardPrefs } from '@/components/dashboard/widget-registry';

const OpenContext = React.createContext<() => void>(() => {});

/**
 * Client island that owns the single Customize drawer instance and exposes an
 * `open()` to its descendants via context. Wraps the dashboard body so both the
 * header "Customize" button and the all-off empty-state CTA can open the same
 * drawer. `initial` is the server-rendered prefs; after a save the drawer calls
 * `router.refresh()`, which re-renders this island with fresh `initial`.
 */
export function CustomizeProvider({
  initial,
  children,
}: {
  initial: DashboardPrefs;
  children: React.ReactNode;
}): React.JSX.Element {
  const drawerRef = React.useRef<CustomizeDrawerHandle>(null);
  const open = React.useCallback(() => drawerRef.current?.open(), []);
  return (
    <OpenContext.Provider value={open}>
      {children}
      <CustomizeDrawer ref={drawerRef} initial={initial} />
    </OpenContext.Provider>
  );
}

/** The header "Customize" button — opens the drawer. */
export function CustomizeButton(): React.JSX.Element {
  const open = React.useContext(OpenContext);
  return (
    <button
      type="button"
      onClick={open}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-elevated px-3.5 text-[13px] font-medium text-foreground/80 transition-colors hover:text-foreground"
    >
      <Sliders className="size-[15px]" aria-hidden /> Customize
    </button>
  );
}

/** The all-off empty-state CTA — opens the drawer. */
export function EmptyCustomizeButton(): React.JSX.Element {
  const open = React.useContext(OpenContext);
  return (
    <button
      type="button"
      onClick={open}
      className="mt-4 h-[38px] rounded-lg bg-primary px-[18px] text-[13px] font-semibold text-primary-foreground"
    >
      Customize dashboard
    </button>
  );
}
