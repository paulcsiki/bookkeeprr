'use client';

import { useCallback, useEffect, useState, type RefObject } from 'react';

/** True when the Fullscreen API is available in this environment. */
export function fullscreenSupported(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof document.documentElement.requestFullscreen === 'function'
  );
}

export interface UseFullscreenResult {
  /** Whether the document is currently in fullscreen. */
  fullscreen: boolean;
  /** Whether the Fullscreen API is usable (false → caller may hide the control). */
  supported: boolean;
  /** Toggle fullscreen on the element held by `ref`. No-op if unsupported. */
  toggleFullscreen: () => void;
}

/**
 * Drives the Fullscreen API for a reader surface. Requests fullscreen on the
 * `ref` element when not already fullscreen, exits otherwise. Reflects the live
 * `document.fullscreenElement` via the `fullscreenchange` event so the icon stays
 * in sync even when the user leaves fullscreen with the browser's own Esc/F11.
 * Promise rejections (e.g. a browser that requires a user gesture) are swallowed.
 */
export function useFullscreen(ref: RefObject<HTMLElement | null>): UseFullscreenResult {
  const [fullscreen, setFullscreen] = useState(false);
  const supported = fullscreenSupported();

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    // Seed in case we mounted already-fullscreen.
    onChange();
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!fullscreenSupported()) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      const el = ref.current ?? document.documentElement;
      void el.requestFullscreen().catch(() => {});
    }
  }, [ref]);

  return { fullscreen, supported, toggleFullscreen };
}
