'use client';

import { cn } from '@/lib/utils';

export type ScrubPreview = {
  kind: 'text' | 'comics' | 'audio';
  chapterLabel: string;
  chapterTitle: string;
  location: string;
  hue?: number;
};

export function ScrubBubble({
  preview,
  leftPercent,
  className,
}: {
  preview: ScrubPreview;
  leftPercent: number;
  className?: string;
}): React.JSX.Element {
  return (
    <div
      className={cn('pointer-events-none absolute z-50 -translate-x-1/2', className)}
      style={{ left: `${leftPercent}%`, bottom: 'calc(100% + 14px)' }}
    >
      <div
        className="relative flex w-[180px] flex-col gap-1.5 rounded-xl border border-border p-3 shadow-xl"
        style={{ background: 'var(--reader-chrome-2, var(--color-popover))' }}
      >
        {/* Per-kind thumbnail */}
        <div
          className="aspect-[3/2] w-full rounded border border-border"
          style={{
            background:
              preview.kind === 'comics'
                ? `linear-gradient(160deg, hsl(${preview.hue ?? 220} 42% 28%), hsl(${preview.hue ?? 220} 35% 14%))`
                : preview.kind === 'audio'
                  ? 'color-mix(in oklab, var(--color-primary) 30%, transparent)'
                  : 'var(--color-muted)',
          }}
        />
        <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          {preview.chapterLabel}
        </div>
        <div className="truncate text-[11.5px] font-medium">{preview.chapterTitle}</div>
        <div className="font-mono text-[10px]" style={{ color: 'var(--reader-accent, var(--color-primary))' }}>
          {preview.location}
        </div>
        {/* 45° pointer */}
        <div
          className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 border-b border-r border-border"
          style={{ background: 'var(--reader-chrome-2, var(--color-popover))' }}
        />
      </div>
    </div>
  );
}
