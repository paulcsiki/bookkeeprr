'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import type { ChapterMark, ReaderManifest } from '@bookkeeprr/types';
import { RIcon } from './icons';
import { inkA, accentA } from './lib/colors';
import { ensureReaderKeyframes } from './anim';

/**
 * Round chrome icon button, tinted from `--reader-*` tokens.
 *
 * All siblings share one shape/size/hover. `active` indicates a toggled-on
 * state with a *subtle* accent tint + accent-colored glyph (NOT a solid blob);
 * `fill` paints the glyph filled (used for the active bookmark). Idle glyphs use
 * the full-strength `--reader-ink` for legibility on the dim reader chrome.
 */
function CBtn({
  name,
  onClick,
  active,
  fill,
  badge,
  size = 19,
  label,
  stroke = 1.7,
}: {
  name: string;
  onClick?: () => void;
  active?: boolean;
  fill?: boolean;
  badge?: boolean;
  size?: number;
  label?: string;
  stroke?: number;
}) {
  const [hover, setHover] = useState(false);

  const background = active
    ? accentA(0.16)
    : hover
      ? inkA(0.1)
      : 'transparent';
  const color = active ? 'var(--reader-accent)' : 'var(--reader-ink)';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onBlur={() => setHover(false)}
      style={{
        width: 38,
        height: 38,
        borderRadius: 11,
        border: 'none',
        cursor: 'pointer',
        background,
        position: 'relative',
        color,
        display: 'grid',
        placeItems: 'center',
        transition: 'background .15s, color .15s',
      }}
    >
      <RIcon name={name} size={size} stroke={stroke} fill={fill} />
      {badge && (
        <span
          style={{
            position: 'absolute',
            top: 7,
            right: 7,
            width: 6,
            height: 6,
            borderRadius: 99,
            background: 'var(--reader-accent)',
          }}
        />
      )}
    </button>
  );
}

export interface ReaderTopBarProps {
  manifest: ReaderManifest;
  /** The current chapter mark (for the subtitle line). */
  chapter?: ChapterMark;
  /** Leave the reader (the back chevron). Usually routes to /library. */
  onBack?: () => void;
  onTOC?: () => void;
  onSettings?: () => void;
  onBookmark?: () => void;
  onFullscreen?: () => void;
  bookmarked: boolean;
  /** Hidden in immersive mode — fades + lifts out. */
  hidden?: boolean;
  /** Compact (mobile) layout. */
  compact?: boolean;
  /** Top safe-area inset in px (overrides the default top padding). */
  topInset?: number;
  /** Whether the app is fullscreen (toggles the expand/shrink glyph). */
  fullscreen?: boolean;
  /**
   * Floating chrome mode — hides the bar and renders a top-centre title chip
   * plus a bottom-centre action cluster instead.
   */
  floating?: boolean;
}

/**
 * Reader top bar — back · centred title/chapter · actions. Hides in immersive
 * mode. When `floating` is true, renders the design's two-piece floating chrome:
 * a top-centre title chip and a bottom-centre action cluster, both with pill
 * styling and fade+translate transitions. Bar mode (default) renders the
 * gradient-backed horizontal bar. All colors come from `--reader-*` tokens.
 */
export function ReaderTopBar({
  manifest,
  chapter,
  onBack,
  onTOC,
  onSettings,
  onBookmark,
  onFullscreen,
  bookmarked,
  hidden = false,
  compact = false,
  topInset,
  fullscreen = false,
  floating = false,
}: ReaderTopBarProps) {
  useEffect(() => {
    ensureReaderKeyframes();
  }, []);

  const padTop = topInset != null ? topInset : compact ? 46 : 12;

  // Audiobooks open a playback-options sheet (speed / sleep / auto-scroll), not
  // a text-display sheet — so the `aa` glyph (text size) is wrong there. Use the
  // sliders glyph + "Playback" label for audio; keep `aa`/"Display" otherwise.
  const isAudio = manifest.reader === 'audio';
  const settingsIcon = isAudio ? 'sliders' : 'aa';
  const settingsLabel = isAudio ? 'Playback' : 'Display';

  if (floating) {
    // Chapter name: strip any leading separators and take the first segment
    const chapterName = chapter
      ? chapter.title.split(/[·.:]/).map((s) => s.trim()).filter(Boolean)[0] ?? ''
      : '';

    return (
      <>
        {/* Top-centre title chip */}
        <div
          style={{
            position: 'absolute',
            top: padTop + 4,
            left: 0,
            right: 0,
            zIndex: 30,
            display: 'flex',
            justifyContent: 'center',
            transition: 'opacity .28s, transform .28s',
            opacity: hidden ? 0 : 1,
            transform: hidden ? 'translateY(-10px)' : 'none',
            pointerEvents: hidden ? 'none' : 'auto',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--reader-chrome-2)',
              border: '1px solid var(--reader-line)',
              borderRadius: 99,
              padding: '6px 14px',
              boxShadow: '0 6px 18px color-mix(in srgb, var(--reader-ink) 16%, transparent)',
              maxWidth: '76%',
            }}
          >
            <CBtn name="chevL" size={16} label="Back" onClick={onBack} />
            <span
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: 'var(--reader-ink)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {manifest.title}
            </span>
            {chapterName && (
              <span
                className="font-mono"
                style={{
                  fontSize: 10,
                  color: 'var(--reader-faint)',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                · {chapterName}
              </span>
            )}
          </div>
        </div>
        {/* Bottom-centre action cluster (above the rail) */}
        <div
          style={{
            position: 'absolute',
            bottom: compact ? 74 : 64,
            left: 0,
            right: 0,
            zIndex: 31,
            display: 'flex',
            justifyContent: 'center',
            transition: 'opacity .28s, transform .28s',
            opacity: hidden ? 0 : 1,
            transform: hidden ? 'translateY(12px)' : 'none',
            pointerEvents: hidden ? 'none' : 'auto',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              background: 'var(--reader-chrome-2)',
              border: '1px solid var(--reader-line)',
              borderRadius: 99,
              padding: 4,
              boxShadow: '0 10px 28px color-mix(in srgb, var(--reader-ink) 22%, transparent)',
            }}
          >
            <CBtn
              name="bookmark"
              onClick={onBookmark}
              active={bookmarked}
              fill={bookmarked}
              size={17}
              label="Bookmark"
            />
            <CBtn name="list" onClick={onTOC} size={19} label="Contents" />
            <CBtn name={settingsIcon} onClick={onSettings} size={20} label={settingsLabel} />
            {!compact && (
              <CBtn
                name={fullscreen ? 'shrink' : 'expand'}
                onClick={onFullscreen}
                size={18}
                label="Fullscreen"
              />
            )}
          </div>
        </div>
      </>
    );
  }

  const containerStyle: CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    paddingTop: padTop,
    background:
      'linear-gradient(var(--reader-chrome) 62%, transparent)',
    transition: 'opacity .28s ease, transform .28s ease',
    opacity: hidden ? 0 : 1,
    transform: hidden ? 'translateY(-12px)' : 'none',
    pointerEvents: hidden ? 'none' : 'auto',
  };

  const subtitle = chapter ? chapter.title : manifest.author ?? '';

  return (
    <div style={containerStyle}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: compact ? '0 10px 12px' : '0 14px 12px',
        }}
      >
        <CBtn name="chevL" size={22} label="Back" onClick={onBack} />
        <div style={{ flex: 1, minWidth: 0, textAlign: 'center', padding: '0 4px' }}>
          <div
            className="font-display"
            style={{
              fontWeight: 600,
              fontSize: compact ? 14 : 15,
              color: 'var(--reader-ink)',
              letterSpacing: '-0.01em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {manifest.title}
            {manifest.volumeLabel ? (
              <span style={{ color: 'var(--reader-ink-soft)', fontWeight: 500 }}>
                {' '}
                · {manifest.volumeLabel}
              </span>
            ) : null}
          </div>
          <div
            className="font-mono"
            style={{
              fontSize: 10,
              color: 'var(--reader-ink-soft)',
              letterSpacing: '0.04em',
              marginTop: 2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {subtitle}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <CBtn
            name="bookmark"
            onClick={onBookmark}
            active={bookmarked}
            fill={bookmarked}
            size={17}
            label="Bookmark"
          />
          {!compact && <CBtn name="list" onClick={onTOC} size={19} label="Contents" />}
          <CBtn name={settingsIcon} onClick={onSettings} size={20} label={settingsLabel} />
          {!compact && (
            <CBtn
              name={fullscreen ? 'shrink' : 'expand'}
              onClick={onFullscreen}
              size={18}
              label="Fullscreen"
            />
          )}
          {compact && <CBtn name="list" onClick={onTOC} size={19} label="Contents" />}
        </div>
      </div>
    </div>
  );
}
