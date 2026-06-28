'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useManifest } from './hooks/useManifest';
import { usePeers } from './hooks/usePeers';
import { usePace } from './hooks/usePace';
import { ComicsReader } from './ComicsReader';
import { TextReader } from './TextReader';
import { AudioReader } from './AudioReader';
import { FinishedView } from './FinishedView';
import { HandoffCard } from './HandoffCard';
import { manifestWithLoc } from './lib/loc';
import { getDeviceId } from '@/lib/device-id';

export interface ReaderProps {
  /** Address the readable by its audio volume. */
  volumeId?: number;
  /** Address the readable by a single paged library file. */
  fileId?: number;
  /**
   * Optional deep-link target (`?loc=`). When present and resolvable for the
   * readable's format, the reader opens at this location instead of the saved
   * progress; an absent/invalid token falls back to saved progress.
   */
  loc?: string;
}

/**
 * The reader shell. Fetches the {@link useManifest} for the addressed readable,
 * renders a themed loading / error surface while it resolves, then dispatches to
 * the matching player (`comics` / `text` / `audio`). Each player owns its own
 * `ReaderRoot` (seeded to a content-appropriate page theme), so the shell only
 * picks the right one and forwards the manifest.
 *
 * Lives under the `(reader)` route group, which provides `QueryProvider` and a
 * full-bleed wrapper but NONE of the app shell (no Sidebar / TopBar).
 */
export function Reader({ volumeId, fileId, loc }: ReaderProps): React.JSX.Element {
  const router = useRouter();
  const { data: rawManifest, isError } = useManifest({ volumeId, fileId });
  // Honor a `?loc=` deep-link by overriding the manifest's saved progress with
  // the resolved location; an absent/invalid token leaves saved progress intact.
  const manifest = rawManifest ? manifestWithLoc(rawManifest, loc) : rawManifest;
  // Explicit "Back to library" destination: the series the book belongs to,
  // falling back to the library root when the manifest hasn't resolved.
  const goToSeries = () =>
    router.push(manifest?.seriesId ? `/library/${manifest.seriesId}` : '/library');

  // Exiting the reader (Escape / the back arrow) returns to wherever it was
  // opened from — the dashboard's Continue-reading rail, the series page,
  // search, etc. — rather than always forcing the series page. Falls back to the
  // series/library when there's no in-app history (a deep link or fresh tab).
  const onBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      goToSeries();
    }
  };

  // Track whether the user chose to restart from the FinishedView this session.
  const [sessionRestarted, setSessionRestarted] = useState(false);
  // Track whether the user dismissed the HandoffCard in this session.
  const [handoffDismissed, setHandoffDismissed] = useState(false);
  // Track a peer-overridden position (when user taps "Resume").
  const [peerPosition, setPeerPosition] = useState<number | null>(null);

  // Stable device identity — read from localStorage once, after hydration.
  const deviceIdRef = useRef('');
  useEffect(() => {
    deviceIdRef.current = getDeviceId();
    // Trigger a re-render so usePeers gets the real deviceId.
    setHandoffDismissed((v) => v);
  }, []);

  const deviceId = deviceIdRef.current;
  const localPosition = peerPosition ?? (manifest?.progress.position ?? 0);

  const { peers } = usePeers(manifest?.readableKey ?? '', deviceId);
  const { paceLabel } = usePace();

  if (isError) {
    return <ReaderError />;
  }

  if (!manifest) {
    return <ReaderLoading />;
  }

  // Show the FinishedView when the book was previously finished and the user
  // hasn't restarted in this session. `restartedFromFinish` means the server
  // already reset it (manifest was opened after a finish), so skip FinishedView
  // in that case too.
  const isFinished =
    manifest.progress.finished &&
    !manifest.progress.restartedFromFinish &&
    !sessionRestarted;

  if (isFinished) {
    return (
      <FinishedView
        manifest={manifest}
        stats={{
          finishedAt: new Date(),
          minutesRead: 0,
          pages: manifest.pageCount ?? 0,
          paceLabel,
        }}
        onStartOver={() => {
          setSessionRestarted(true);
        }}
        onBackToLibrary={goToSeries}
      />
    );
  }

  // Find the leading peer (the one furthest ahead that is also > 5% ahead of local).
  const HANDOFF_THRESHOLD = 0.05;
  const leadingPeer = !handoffDismissed
    ? peers.find((p) => p.position > localPosition + HANDOFF_THRESHOLD)
    : undefined;

  // Determine how long ago the peer synced.
  function syncedAgo(updatedAt: string): string {
    const diffMs = Date.now() - new Date(updatedAt).getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    return `${Math.floor(diffH / 24)}d ago`;
  }

  const playerEl = (() => {
    switch (manifest.reader) {
      case 'comics':
        return <ComicsReader manifest={manifest} onBack={onBack} />;
      case 'text':
        return <TextReader manifest={manifest} onBack={onBack} />;
      case 'audio':
        return <AudioReader manifest={manifest} onBack={onBack} />;
      default:
        return <ReaderError />;
    }
  })();

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      {leadingPeer && (
        // data-reader-theme scopes --reader-* tokens so HandoffCard renders
        // correctly with the reader palette (paper default) rather than app-shell tokens.
        <div className="z-50 px-4 pt-3" data-reader-theme="paper">
          <HandoffCard
            deviceName={leadingPeer.deviceName ?? 'another device'}
            position={leadingPeer.position}
            lastSyncedAgo={syncedAgo(leadingPeer.updatedAt)}
            onResume={() => {
              setPeerPosition(leadingPeer.position);
              setHandoffDismissed(true);
            }}
          />
        </div>
      )}
      {playerEl}
    </div>
  );
}

/** Full-screen themed loading surface shown while the manifest resolves. */
function ReaderLoading(): React.JSX.Element {
  return (
    <div
      data-testid="reader-loading"
      className="flex h-screen w-screen items-center justify-center bg-background"
    >
      <div className="flex flex-col items-center gap-4">
        <span
          aria-hidden
          className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary"
        />
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          Loading…
        </p>
      </div>
    </div>
  );
}

/** Full-screen friendly error surface with a route back to the library. */
function ReaderError(): React.JSX.Element {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background px-6">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <h1 className="font-display text-2xl font-semibold text-foreground">
          Couldn&rsquo;t open this title
        </h1>
        <p className="text-sm text-muted-foreground">
          The file may be missing, unreadable, or in a format the reader doesn&rsquo;t support.
        </p>
        <Link
          href="/library"
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Back to library
        </Link>
      </div>
    </div>
  );
}
