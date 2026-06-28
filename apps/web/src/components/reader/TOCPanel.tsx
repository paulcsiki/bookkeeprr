'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import type { ReaderManifest } from '@bookkeeprr/types';
import { RIcon } from './icons';
import { inkA } from './lib/colors';
import {
  chapterIndexAt,
  chapterPositions,
  fmtClock,
  isTimeBased,
} from './lib/format';
import { ensureReaderKeyframes } from './anim';

/** An href-addressed TOC entry (foliate-rendered formats: MOBI / AZW3). */
export interface HrefTocEntry {
  label: string;
  href: string;
  /** Nesting depth (0 = top level) used for indentation. */
  depth: number;
}

export interface TOCPanelProps {
  manifest: ReaderManifest;
  /** Current position, 0..1 (to mark the active chapter). */
  position: number;
  compact?: boolean;
  /** Jump to a 0..1 position. */
  onJump: (pos: number) => void;
  /**
   * An href-addressed table of contents (foliate / MOBI / AZW3). When non-empty
   * the Contents tab renders THESE entries (in place of `manifest.chapters`) and
   * tapping one calls `onJumpHref`. Falls back to the chapters path otherwise.
   */
  hrefEntries?: HrefTocEntry[];
  /** Jump to an href TOC entry (foliate's `view.goTo`). */
  onJumpHref?: (href: string) => void;
  onClose: () => void;
  /** Which edge the panel slides from. */
  side?: 'left' | 'right';
  /** Contents layout: a flat list or a cover grid. */
  tocStyle?: 'list' | 'grid';
}

type Tab = 'contents' | 'marks';

/**
 * Table of contents slide-in panel. Two tabs: Contents (list or grid) and
 * Bookmarks. For v1 the Bookmarks tab shows an empty/coming-soon state.
 * Chapters jump to their start position via `onJump`. Token-only colors.
 */
export function TOCPanel({
  manifest,
  position,
  compact = false,
  onJump,
  hrefEntries,
  onJumpHref,
  onClose,
  side = 'left',
  tocStyle = 'list',
}: TOCPanelProps) {
  const chapters = manifest.chapters ?? [];
  // An href-addressed TOC (foliate / MOBI / AZW3) takes precedence over the
  // position-based chapter list when present.
  const hrefToc = hrefEntries ?? [];
  const hasHrefToc = hrefToc.length > 0;
  // A real table of contents otherwise only exists for chaptered content
  // (audiobooks). EPUB/PDF carry no `chapters`, so without an href TOC the
  // Contents tab would be an empty dead panel — hide it and open straight to
  // Bookmarks for those formats.
  const hasContents = hasHrefToc || chapters.length > 0;
  const [active, setActive] = useState<Tab>(hasContents ? 'contents' : 'marks');

  useEffect(() => {
    ensureReaderKeyframes();
  }, []);
  const starts = chapterPositions(manifest);
  const curIdx = chapterIndexAt(manifest, position);
  const audio = isTimeBased(manifest);

  const jump = (i: number) => {
    onJump(Math.min(1, (starts[i] ?? 0) + 0.001));
    onClose();
  };

  const jumpHref = (href: string) => {
    onJumpHref?.(href);
    onClose();
  };

  const chapterMeta = (i: number): string => {
    if (audio) {
      const c = chapters[i];
      const next = chapters[i + 1];
      const startSec = c?.startSec ?? 0;
      const endSec = next?.startSec ?? manifest.totalSec ?? startSec;
      return fmtClock(Math.max(0, endSec - startSec) / 60);
    }
    return `p.${chapters[i]?.startPage ?? 1}`;
  };

  const panelStyle: CSSProperties = {
    width: compact ? '86%' : 360,
    maxWidth: '92%',
    height: '100%',
    background: 'var(--reader-chrome)',
    borderRight: side === 'left' ? `1px solid var(--reader-line)` : 'none',
    borderLeft: side === 'right' ? `1px solid var(--reader-line)` : 'none',
    display: 'flex',
    flexDirection: 'column',
    animation: `rd-slide-${side} .28s cubic-bezier(.16,1,.3,1)`,
    boxShadow: `0 0 50px ${inkA(0.25)}`,
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 55,
        display: 'flex',
        justifyContent: side === 'left' ? 'flex-start' : 'flex-end',
        background: inkA(0.28),
        backdropFilter: 'blur(2px)',
        animation: 'rd-fade .2s ease',
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={panelStyle}>
        <div style={{ padding: compact ? '46px 18px 10px' : '18px 18px 10px' }}>
          <div
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}
          >
            <span
              className="font-display"
              style={{ fontSize: 17, fontWeight: 600, color: 'var(--reader-ink)' }}
            >
              {manifest.title}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{ border: 'none', background: 'transparent', color: 'var(--reader-ink-soft)', cursor: 'pointer', padding: 4 }}
            >
              <RIcon name="close" size={18} />
            </button>
          </div>
          <div style={{ display: 'flex', gap: 4, background: inkA(0.06), borderRadius: 9, padding: 3 }}>
            {(
              [
                ...(hasContents ? ([['contents', 'Contents']] as [Tab, string][]) : []),
                ['marks', 'Bookmarks'],
              ] as [Tab, string][]
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setActive(k)}
                style={{
                  flex: 1,
                  height: 32,
                  border: 'none',
                  borderRadius: 7,
                  cursor: 'pointer',
                  background: active === k ? 'var(--reader-page)' : 'transparent',
                  color: active === k ? 'var(--reader-accent)' : 'var(--reader-ink-soft)',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 10px 20px' }}>
          {active === 'contents' && hasHrefToc ? (
            hrefToc.map((entry, i) => (
              <button
                key={`${entry.href}:${i}`}
                type="button"
                onClick={() => jumpHref(entry.href)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  textAlign: 'left',
                  padding: '11px 12px',
                  paddingLeft: 12 + entry.depth * 16,
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: 10,
                  background: 'transparent',
                  marginBottom: 2,
                }}
              >
                <span
                  style={{
                    flex: 1,
                    fontSize: 13.5,
                    color: entry.depth > 0 ? 'var(--reader-ink-soft)' : 'var(--reader-ink)',
                    fontWeight: entry.depth > 0 ? 400 : 500,
                    lineHeight: 1.3,
                  }}
                >
                  {entry.label}
                </span>
              </button>
            ))
          ) : active === 'contents' && tocStyle === 'grid' ? (
            <div
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '4px 4px' }}
            >
              {chapters.map((c, i) => {
                const isCur = i === curIdx;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => jump(i)}
                    style={{
                      textAlign: 'left',
                      border: `1px solid ${isCur ? 'var(--reader-accent)' : 'var(--reader-line)'}`,
                      cursor: 'pointer',
                      borderRadius: 12,
                      padding: 0,
                      overflow: 'hidden',
                      background: 'var(--reader-page)',
                    }}
                  >
                    <div
                      style={{
                        position: 'relative',
                        aspectRatio: '5/3',
                        background: inkA(0.1),
                      }}
                    >
                      <span
                        className="font-mono"
                        style={{ position: 'absolute', top: 7, left: 8, fontSize: 10, color: 'var(--reader-ink-soft)' }}
                      >
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      {isCur && (
                        <span
                          style={{
                            position: 'absolute',
                            bottom: 7,
                            right: 8,
                            width: 7,
                            height: 7,
                            borderRadius: 99,
                            background: 'var(--reader-accent)',
                          }}
                        />
                      )}
                    </div>
                    <div style={{ padding: '8px 9px' }}>
                      <div
                        style={{
                          fontSize: 11.5,
                          fontWeight: isCur ? 600 : 500,
                          color: isCur ? 'var(--reader-ink)' : 'var(--reader-ink-soft)',
                          lineHeight: 1.25,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {c.title}
                      </div>
                      <div
                        className="font-mono"
                        style={{ fontSize: 9, color: 'var(--reader-faint)', marginTop: 4 }}
                      >
                        {chapterMeta(i)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : active === 'contents' ? (
            chapters.map((c, i) => {
              const isCur = i === curIdx;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => jump(i)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    width: '100%',
                    textAlign: 'left',
                    padding: '11px 12px',
                    border: 'none',
                    cursor: 'pointer',
                    borderRadius: 10,
                    background: isCur ? inkA(0.08) : 'transparent',
                    marginBottom: 2,
                  }}
                >
                  <span
                    className="font-mono"
                    style={{
                      fontSize: 11,
                      color: isCur ? 'var(--reader-accent)' : 'var(--reader-faint)',
                      minWidth: 22,
                    }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      fontSize: 13.5,
                      color: isCur ? 'var(--reader-ink)' : 'var(--reader-ink-soft)',
                      fontWeight: isCur ? 600 : 400,
                      lineHeight: 1.3,
                    }}
                  >
                    {c.title}
                  </span>
                  <span className="font-mono" style={{ fontSize: 10, color: 'var(--reader-faint)' }}>
                    {chapterMeta(i)}
                  </span>
                  {isCur && (
                    <span
                      style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--reader-accent)' }}
                    />
                  )}
                </button>
              );
            })
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                padding: '48px 24px',
                textAlign: 'center',
              }}
            >
              <RIcon name="bookmark" size={26} color="var(--reader-faint)" />
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--reader-ink-soft)' }}>
                No bookmarks yet
              </div>
              <div style={{ fontSize: 12, color: 'var(--reader-faint)', lineHeight: 1.4 }}>
                Bookmarks and highlights you add will appear here.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
