'use client';

import { useEffect, useRef } from 'react';

/** Window after a fullscreen exit during which an Escape is treated as "that
 *  same Escape that left fullscreen" and must NOT also exit the reader. */
const FULLSCREEN_EXIT_GRACE_MS = 500;

export interface UseReaderEscapeArgs {
  /** Whether a panel/overlay (TOC / settings) is currently open. */
  overlayOpen: boolean;
  /** Close the open overlay. Called when Escape fires while one is open. */
  closeOverlay: () => void;
  /** Leave the reader (back to the library/series). Called by a final Escape. */
  onExit: () => void;
  /** Whether the reader is currently fullscreen (from useFullscreen). When true,
   *  Escape leaves fullscreen only and must NOT exit the reader. */
  fullscreen?: boolean;
}

/**
 * Global Escape handling for the reader. Escape backs out one layer at a time:
 *   1. an open panel (TOC / settings) closes first, then
 *   2. fullscreen exits (without leaving the reader), then
 *   3. a final Escape exits the reader.
 * Checking `document.fullscreenElement` at keydown time means the same Escape
 * that the browser uses to leave fullscreen no longer also navigates away — you
 * stay in the reader and press Escape again to leave. The latest props are
 * captured each render so the handler always acts on current state.
 */
export function useReaderEscape({
  overlayOpen,
  closeOverlay,
  onExit,
  fullscreen = false,
}: UseReaderEscapeArgs): void {
  // React's `fullscreen` flag is the reliable signal: it flips off via the async
  // fullscreenchange→setState, so during the SYNCHRONOUS Escape keydown that
  // triggers the exit it is still `true`. document.fullscreenElement, by
  // contrast, can already be null by the time the keydown fires. We read the
  // latest value through a ref so the listener never needs re-subscribing.
  const fullscreenRef = useRef(fullscreen);
  fullscreenRef.current = fullscreen;
  // Belt-and-suspenders: also swallow an Escape landing just after a fullscreen
  // exit (covers browsers that flip React state before delivering the keydown).
  const exitedFullscreenAt = useRef(0);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onFs = (): void => {
      if (!document.fullscreenElement) exitedFullscreenAt.current = Date.now();
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (overlayOpen) {
        e.preventDefault();
        closeOverlay();
        return;
      }
      const inFullscreen =
        fullscreenRef.current ||
        (typeof document !== 'undefined' && Boolean(document.fullscreenElement));
      if (inFullscreen) {
        // Leave fullscreen only; the browser does this for us, we just mirror it.
        if (typeof document !== 'undefined' && document.fullscreenElement) {
          void document.exitFullscreen?.();
        }
        return;
      }
      // The trailing Escape that just left fullscreen — don't also exit.
      if (Date.now() - exitedFullscreenAt.current < FULLSCREEN_EXIT_GRACE_MS) return;
      e.preventDefault();
      onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlayOpen, closeOverlay, onExit]);
}
