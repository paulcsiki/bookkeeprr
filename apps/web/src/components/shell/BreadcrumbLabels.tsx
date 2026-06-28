'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type LabelMap = Record<string, string>;
type Ctx = {
  labels: LabelMap;
  setLabel: (href: string, label: string) => void;
  clearLabel: (href: string) => void;
};

const BreadcrumbLabelContext = createContext<Ctx | null>(null);

/**
 * Holds per-href label overrides so the URL-derived top-bar breadcrumb can show
 * human names for dynamic segments (e.g. /library/2 → "Bunny Drop") instead of
 * the raw id. A page registers its label via {@link useBreadcrumbLabel}; the
 * breadcrumb reads the map. Lives in the app shell so it wraps both the TopBar
 * and the page content.
 */
export function BreadcrumbLabelProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [labels, setLabels] = useState<LabelMap>({});

  const setLabel = useCallback((href: string, label: string) => {
    setLabels((prev) => (prev[href] === label ? prev : { ...prev, [href]: label }));
  }, []);

  const clearLabel = useCallback((href: string) => {
    setLabels((prev) => {
      if (!(href in prev)) return prev;
      const next = { ...prev };
      delete next[href];
      return next;
    });
  }, []);

  const value = useMemo(() => ({ labels, setLabel, clearLabel }), [labels, setLabel, clearLabel]);
  return <BreadcrumbLabelContext.Provider value={value}>{children}</BreadcrumbLabelContext.Provider>;
}

export function useBreadcrumbLabels(): LabelMap {
  return useContext(BreadcrumbLabelContext)?.labels ?? {};
}

/**
 * Register a human label for a dynamic route segment. The override is applied
 * after hydration (so the id may flash briefly on first paint) and removed when
 * the page unmounts.
 */
export function useBreadcrumbLabel(href: string, label: string | null | undefined): void {
  const ctx = useContext(BreadcrumbLabelContext);
  // Depend on the individually-stable setters (useCallback([])), NOT the whole
  // context value object — the value changes on every label update, which would
  // otherwise re-run this effect (clear→set→clear…) in an infinite loop.
  const setLabel = ctx?.setLabel;
  const clearLabel = ctx?.clearLabel;
  useEffect(() => {
    if (!setLabel || !clearLabel || !label) return;
    setLabel(href, label);
    return () => clearLabel(href);
  }, [href, label, setLabel, clearLabel]);
}
