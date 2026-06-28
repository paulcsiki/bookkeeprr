'use client';

import { useEffect, type CSSProperties } from 'react';
import { RIcon } from './icons';
import { inkA } from './lib/colors';
import { ensureReaderKeyframes } from './anim';

export interface RestartToastProps {
  /** Optional dismiss handler — when provided, a close affordance is shown. */
  onDismiss?: () => void;
  compact?: boolean;
}

/**
 * The "Finished last time — starting over" toast. Shown for one beat when an
 * already-finished readable is reopened and reset to the beginning. Token-only
 * colors so it reads on any reader page surface.
 */
export function RestartToast({ onDismiss, compact = false }: RestartToastProps) {
  useEffect(() => {
    ensureReaderKeyframes();
  }, []);

  const wrapStyle: CSSProperties = {
    position: 'absolute',
    top: compact ? 92 : 64,
    left: 0,
    right: 0,
    zIndex: 45,
    display: 'flex',
    justifyContent: 'center',
    pointerEvents: 'none',
  };

  return (
    <div style={wrapStyle}>
      <div
        style={{
          pointerEvents: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          maxWidth: '86%',
          background: 'var(--reader-chrome-2)',
          border: `1px solid var(--reader-line)`,
          borderRadius: 99,
          padding: '8px 14px',
          boxShadow: `0 8px 24px ${inkA(0.18)}`,
          animation: 'rd-fade .24s ease',
        }}
      >
        <RIcon name="refresh" size={15} color="var(--reader-accent)" />
        <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--reader-ink)' }}>
          Finished last time — starting over.
        </span>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--reader-ink-soft)',
              cursor: 'pointer',
              padding: 2,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <RIcon name="close" size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
