'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { ReaderManifest } from '@bookkeeprr/types';
import { inkA, isDarkTheme } from './lib/colors';
import {
  chapterPositions,
  fmtClock,
  fmtTimecode,
  isTimeBased,
  pageAt,
  posFromClientX,
  totalMin,
  totalPages,
} from './lib/format';
import { ensureReaderKeyframes } from './anim';
import { ScrubBubble, type ScrubPreview } from './ScrubBubble';

export interface ProgressRailProps {
  manifest: ReaderManifest;
  /** Current position, 0..1. */
  position: number;
  compact?: boolean;
  /** Called with a 0..1 position while scrubbing. */
  onScrub?: (pos: number) => void;
  /** Override the auto-derived left/right labels. */
  label?: { left: string; right: string };
  /** Bottom safe-area inset in px. */
  botInset?: number;
  /** When provided, shows a ScrubBubble preview above the thumb while dragging. */
  scrubPreview?: (pos: number) => ScrubPreview;
  /** When true, the rail slides out and fades (immersive auto-hide). */
  hidden?: boolean;
}

/**
 * Always-on progress rail — a thin scrubber with chapter ticks and page/time
 * context labels. The audio variant labels with timecodes. Pointer-drag scrubs
 * and reports a 0..1 position through `onScrub`. Token-only colors.
 */
export function ProgressRail({
  manifest,
  position,
  compact = false,
  onScrub,
  label,
  botInset,
  scrubPreview,
  hidden = false,
}: ProgressRailProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const audio = isTimeBased(manifest);
  const ticks = chapterPositions(manifest);
  const [scrubbing, setScrubbing] = useState(false);
  const [dragPos, setDragPos] = useState(position);

  useEffect(() => {
    ensureReaderKeyframes();
  }, []);

  const scrub = (clientX: number) => {
    if (!railRef.current) return;
    const rect = railRef.current.getBoundingClientRect();
    const next = posFromClientX(clientX, rect);
    setDragPos(next);
    onScrub?.(next);
  };
  const onDown = (e: React.PointerEvent) => {
    setScrubbing(true);
    scrub(e.clientX);
    const mv = (ev: PointerEvent) => scrub(ev.clientX);
    const up = () => {
      setScrubbing(false);
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };

  const thumbScale = scrubbing ? 1.25 : 1;

  const leftLabel = label
    ? label.left
    : audio
      ? fmtTimecode(position * totalMin(manifest))
      : `Page ${pageAt(manifest, position)}`;
  const rightLabel = label
    ? label.right
    : audio
      ? `-${fmtClock(totalMin(manifest) * (1 - position))}`
      : `${totalPages(manifest) - pageAt(manifest, position)} left · ${Math.round(position * 100)}%`;

  const containerStyle: CSSProperties = {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 30,
    transform: hidden ? 'translateY(120%)' : 'translateY(0)',
    opacity: hidden ? 0 : 1,
    pointerEvents: hidden ? 'none' : 'auto',
    transition: 'transform 0.3s ease, opacity 0.3s ease',
    paddingBottom: botInset != null ? botInset : compact ? 26 : 12,
    paddingTop: 10,
    background: 'linear-gradient(transparent, var(--reader-chrome) 42%)',
  };

  return (
    <div style={containerStyle}>
      <div style={{ padding: compact ? '0 16px' : '0 22px' }}>
        <div
          ref={railRef}
          data-reader-rail
          onPointerDown={onDown}
          style={{
            position: 'relative',
            height: 18,
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer',
            touchAction: 'none',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              height: 3,
              borderRadius: 99,
              background: inkA(0.14),
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 0,
              width: `${position * 100}%`,
              height: 3,
              borderRadius: 99,
              background: 'var(--reader-accent)',
            }}
          />
          {ticks.map((t, i) => (
            <span
              key={i}
              style={{
                position: 'absolute',
                left: `${t * 100}%`,
                width: 1.5,
                height: 7,
                background: inkA(isDarkTheme() ? 0.28 : 0.22),
                transform: 'translateX(-50%)',
              }}
            />
          ))}
          <span
            style={{
              position: 'absolute',
              left: `${position * 100}%`,
              transform: `translateX(-50%) scale(${thumbScale})`,
              width: 13,
              height: 13,
              borderRadius: 99,
              background: 'var(--reader-accent)',
              boxShadow: `0 1px 4px ${inkA(0.4)}, 0 0 0 3px var(--reader-chrome)`,
              transition: 'transform 0.1s ease',
            }}
          />
          {scrubbing && scrubPreview ? (
            <ScrubBubble preview={scrubPreview(dragPos)} leftPercent={dragPos * 100} />
          ) : null}
        </div>
        <div
          className="font-mono"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 6,
            fontSize: 10,
            letterSpacing: '0.03em',
            color: 'var(--reader-ink-soft)',
          }}
        >
          <span>{leftLabel}</span>
          <span>{rightLabel}</span>
        </div>
      </div>
    </div>
  );
}
