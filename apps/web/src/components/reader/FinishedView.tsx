'use client';

import { useEffect } from 'react';
import type { ReaderManifest } from '@bookkeeprr/types';
import { isContentType } from '@bookkeeprr/types';
import { Cover } from '@/components/Cover';
import { ensureReaderKeyframes } from './anim';
import { Button } from '@/components/ui/button';
import { Library } from 'lucide-react';

export type FinishedViewProps = {
  manifest: ReaderManifest;
  stats: {
    finishedAt: Date;
    minutesRead: number;
    pages: number;
    paceLabel: string;
  };
  upNext?: { title: string; coverUrl?: string; href: string; kind?: string };
  onStartOver: () => void;
  onStartNext?: () => void;
  onBackToLibrary: () => void;
};

function fmtMinutes(min: number): string {
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function fmtRelative(d: Date): string {
  const days = Math.round((Date.now() - d.getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

/**
 * Celebration view shown when a book reaches 100%. Replaces the regular
 * reader chrome until the user picks an action (Start over / Start next /
 * Back to library). Per chat 4: no 'Read again' button.
 */
export function FinishedView({
  manifest,
  stats,
  upNext,
  onStartOver,
  onStartNext,
  onBackToLibrary,
}: FinishedViewProps): React.JSX.Element {
  useEffect(() => {
    ensureReaderKeyframes();
  }, []);

  return (
    <div
      className="relative grid h-full place-items-center overflow-hidden"
      style={{
        background: 'var(--reader-page, var(--color-background))',
        color: 'var(--reader-ink, var(--color-foreground))',
      }}
    >
      {/* ambient glow */}
      <div
        className="rd-glow pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 60% at 50% 40%, color-mix(in oklab, var(--reader-accent, var(--color-primary)) 18%, transparent), transparent 70%)',
        }}
        aria-hidden
      />

      <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-6 p-8 text-center">
        {/* Cover hero with burst ring */}
        <div className="relative">
          <div
            className="rd-ring pointer-events-none absolute inset-0"
            style={{
              border: '2px solid var(--reader-accent, var(--color-primary))',
              borderRadius: 12,
            }}
            aria-hidden
          />
          <div className="rd-pop relative aspect-[2/3] w-32 overflow-hidden rounded-lg border border-border bg-card shadow-xl">
            {/* No fallback title/label — the big title sits right below the hero. */}
            <Cover
              className="absolute inset-0"
              src={manifest.coverUrl}
              contentType={isContentType(manifest.contentType) ? manifest.contentType : 'ebook'}
              alt={manifest.title}
              loading="eager"
              hideType
            />
          </div>
          <span
            className="rd-pop absolute -bottom-2 -right-2 grid h-8 w-8 place-items-center rounded-full border-2 text-[var(--color-ok-foreground,white)]"
            style={{
              background: 'var(--color-ok)',
              borderColor: 'var(--reader-page, var(--color-background))',
            }}
            aria-hidden
          >
            ✓
          </span>
        </div>

        <div className="rd-rise font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground" style={{ animationDelay: '0.45s' }}>
          Finished
        </div>
        <div className="rd-rise font-display text-2xl font-semibold leading-tight" style={{ animationDelay: '0.55s' }}>
          {manifest.title}
        </div>

        {/* Stats strip */}
        <div className="rd-rise grid w-full grid-cols-4 gap-2 border-y border-border py-3 text-[11px]" style={{ animationDelay: '0.65s' }}>
          <div>
            <div className="text-muted-foreground">Finished</div>
            <div className="font-mono">{fmtRelative(stats.finishedAt)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Time</div>
            <div className="font-mono">{fmtMinutes(stats.minutesRead)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Pages</div>
            <div className="font-mono">{stats.pages}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Pace</div>
            <div className="font-mono">{stats.paceLabel}</div>
          </div>
        </div>

        {/* Up next */}
        {upNext && (
          <div className="rd-rise flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left" style={{ animationDelay: '0.8s' }}>
            <div className="aspect-[2/3] w-12 rounded border border-border bg-muted" />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Up next</div>
              <div className="truncate text-[13px] font-medium">{upNext.title}</div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="rd-rise flex w-full flex-col gap-2" style={{ animationDelay: '0.94s' }}>
          {upNext && onStartNext ? (
            <Button onClick={onStartNext} className="w-full">
              Start {upNext.title}
            </Button>
          ) : (
            <Button onClick={onStartOver} className="w-full">
              Start over
            </Button>
          )}
          <Button variant="outline" onClick={onBackToLibrary} className="w-full">
            <Library className="mr-2 h-4 w-4" /> Back to library
          </Button>
        </div>
      </div>
    </div>
  );
}
