'use client';

import { useEffect, useState } from 'react';
import { CircleCheck, CircleArrowUp, CircleDashed } from 'lucide-react';
import { apiFetch } from '@/lib/api-fetch';
import { VersionHistoryDialog } from './VersionHistoryDialog';

type UpdatesPayload = {
  buildInfo: { version: string; commit: string };
  state: { latestVersion: string | null; fetchError?: string | null };
  updateAvailable: boolean;
};

type VersionPillProps = {
  /** `"sidebar"` (default): full-width button for the sidebar footer.
   *  `"topbar"`: compact inline pill for the top bar action cluster. */
  variant?: 'sidebar' | 'topbar';
};

export function VersionPill({ variant = 'sidebar' }: VersionPillProps): React.JSX.Element | null {
  const [data, setData] = useState<UpdatesPayload | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const r = await apiFetch('/api/updates');
        if (!r.ok || cancelled) return;
        setData((await r.json()) as UpdatesPayload);
      } catch {
        // silent
      }
    }
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (!data) return null;

  const { buildInfo, state, updateAvailable } = data;

  // Label mirrors mobile's "<version> (<commit>)", plus an update-status suffix
  // when known:
  //  - update available  → "0.1.0 (a1b2c3d) · Update Available"
  //  - checked, current  → "0.1.0 (a1b2c3d) · Up To Date"
  //  - unknown (never checked / fetch error) → "0.1.0 (a1b2c3d)" — don't claim
  //    up-to-date when we don't actually know. (commit is "dev" in local dev.)
  const knownUpToDate = !updateAvailable && state.latestVersion !== null && !state.fetchError;
  const StatusIcon = updateAvailable
    ? CircleArrowUp
    : knownUpToDate
      ? CircleCheck
      : CircleDashed;
  const iconClass = updateAvailable
    ? 'text-primary'
    : knownUpToDate
      ? 'text-[var(--color-ok)]'
      : 'text-muted-foreground';
  const base = `${buildInfo.version} (${buildInfo.commit})`;
  const label = updateAvailable
    ? `${base} · Update Available`
    : knownUpToDate
      ? `${base} · Up To Date`
      : base;

  if (variant === 'topbar') {
    return (
      <>
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          title={label}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-xs font-mono text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
        >
          <StatusIcon className={`h-3.5 w-3.5 shrink-0 ${iconClass}`} />
          <span>{label}</span>
        </button>
        <VersionHistoryDialog open={historyOpen} onClose={() => setHistoryOpen(false)} />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setHistoryOpen(true)}
        title={label}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs font-mono text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
      >
        <StatusIcon className={`h-3.5 w-3.5 shrink-0 ${iconClass}`} />
        <span className="truncate">{label}</span>
      </button>
      <VersionHistoryDialog open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </>
  );
}
