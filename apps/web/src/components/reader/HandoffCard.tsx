'use client';

import { RIcon } from './icons';

export type HandoffCardProps = {
  deviceName: string;
  position: number;     // 0..1
  chapter?: string;
  lastSyncedAgo?: string;
  onResume: () => void;
};

/**
 * "Continue from your iPhone · ch.12 · 41%" card. Shown when a peer
 * device's position is meaningfully ahead of the local one.
 *
 * Uses `--reader-*` tokens exclusively so the card reads correctly on every
 * reader palette (paper, sepia, dark, oled). Mirrors reader-chrome.jsx lines
 * 414-431 exactly.
 */
export function HandoffCard({
  deviceName,
  position,
  chapter,
  lastSyncedAgo = 'just now',
  onResume,
}: HandoffCardProps): React.JSX.Element {
  const pct = Math.round(position * 100);
  return (
    <div
      style={{
        background: 'var(--reader-chrome-2)',
        border: '1px solid var(--reader-line)',
        borderRadius: 16,
        padding: 14,
        display: 'flex',
        gap: 13,
        alignItems: 'center',
        width: '100%',
        boxShadow: '0 12px 30px color-mix(in srgb, var(--reader-ink) 16%, transparent)',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: 44,
          height: 44,
          borderRadius: 11,
          background: 'var(--reader-accent)',
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
          color: 'var(--reader-page)',
        }}
      >
        <RIcon name="devices" size={22} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--reader-ink)' }}>
          Continue from your {deviceName}
        </div>
        <div
          className="font-mono"
          style={{
            fontSize: 10.5,
            color: 'var(--reader-ink-soft)',
            marginTop: 2,
            letterSpacing: '0.02em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {chapter ? `${chapter} · ` : ''}{pct}% · synced {lastSyncedAgo}
        </div>
      </div>
      <button
        type="button"
        onClick={onResume}
        style={{
          height: 34,
          padding: '0 15px',
          borderRadius: 9,
          border: 'none',
          background: 'var(--reader-accent)',
          color: 'var(--reader-page)',
          fontWeight: 600,
          fontSize: 12.5,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        Resume
      </button>
    </div>
  );
}
