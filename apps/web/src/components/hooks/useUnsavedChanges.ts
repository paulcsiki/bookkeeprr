'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

const DEFAULT_MESSAGE = 'You have unsaved changes. Leave without saving?';

/**
 * Guards against losing unsaved form edits.
 *
 * While `dirty` is true, this hook:
 * - Registers a `beforeunload` listener so browser reload / tab-close / address-bar
 *   navigation prompts the native "leave site?" dialog.
 * - Registers a capture-phase `click` listener on `document` that intercepts clicks on
 *   internal anchors (`href` starting with `/`, no `target="_blank"`, plain left-click
 *   with no modifier keys). It cancels the default navigation, asks `window.confirm`,
 *   and — if confirmed — performs the navigation via the App Router so the SPA transition
 *   still happens. This catches in-app link navigation that `beforeunload` cannot.
 *
 * Both listeners are removed when `dirty` becomes false or on unmount.
 *
 * @param dirty Whether the form currently has unsaved changes.
 * @param opts.message Confirmation copy reused for both the in-app prompt and `confirmIfDirty`.
 * @returns `confirmIfDirty()` — returns `true` immediately when not dirty; otherwise shows a
 *   `window.confirm` and returns its result. Use it to guard programmatic navigations or
 *   in-place destructive actions (e.g. switching a control that triggers a route change).
 */
export function useUnsavedChanges(
  dirty: boolean,
  opts?: { message?: string },
): { confirmIfDirty: () => boolean } {
  const router = useRouter();
  const message = opts?.message ?? DEFAULT_MESSAGE;

  // Refs let the long-lived listeners read current values without re-binding
  // on every render.
  const dirtyRef = useRef(dirty);
  const messageRef = useRef(message);
  // Set when we intercept a click and the user confirms, so the programmatic
  // router.push() below doesn't re-trigger the click guard.
  const bypassRef = useRef(false);

  dirtyRef.current = dirty;
  messageRef.current = message;

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (!dirty) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent): void => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      // Legacy Chrome requires returnValue to be set.
      e.returnValue = '';
    };

    const handleClick = (e: MouseEvent): void => {
      if (!dirtyRef.current) return;
      if (bypassRef.current) return;
      // Only plain left-clicks without modifiers.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (e.defaultPrevented) return;

      const target = e.target as Element | null;
      const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== '_self') return;

      const href = anchor.getAttribute('href');
      // Internal navigations only — let external / hash / mailto links through.
      if (!href || !href.startsWith('/')) return;

      e.preventDefault();
      e.stopPropagation();

      if (window.confirm(messageRef.current)) {
        bypassRef.current = true;
        router.push(href);
        // Re-arm the guard after this event-loop tick. router.push is async and
        // the component may stay mounted; without this a single confirmed nav
        // would permanently disable the guard for subsequent clicks.
        setTimeout(() => {
          bypassRef.current = false;
        }, 0);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    // Capture phase so we run before Next's Link handler.
    document.addEventListener('click', handleClick, true);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('click', handleClick, true);
    };
  }, [dirty, router]);

  const confirmIfDirty = useCallback((): boolean => {
    if (!dirtyRef.current) return true;
    if (typeof window === 'undefined') return true;
    return window.confirm(messageRef.current);
  }, []);

  return { confirmIfDirty };
}
