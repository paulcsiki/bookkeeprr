// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import type { ReaderManifest } from '@bookkeeprr/types';
import { ReaderTopBar } from '@/components/reader/ReaderTopBar';
import { useReaderEscape } from '@/components/reader/hooks/useReaderEscape';
import { useFullscreen } from '@/components/reader/hooks/useFullscreen';

function pagedManifest(): ReaderManifest {
  return {
    readableKey: 'page:file:1',
    contentType: 'ebook',
    reader: 'text',
    format: 'epub',
    title: 'The Lantern of the Deep',
    author: 'Wren Castellan',
    seriesId: 1,
    pageCount: 300,
    progress: {
      readableKey: 'page:file:1',
      position: 0,
      locator: null,
      finished: false,
      restartedFromFinish: false,
    },
  };
}

describe('useReaderEscape', () => {
  it('Escape closes an open overlay first, then exits on the second press', () => {
    const closeOverlay = vi.fn();
    const onExit = vi.fn();
    let overlayOpen = true;

    const { rerender } = renderHook(
      ({ open }: { open: boolean }) =>
        useReaderEscape({ overlayOpen: open, closeOverlay, onExit }),
      { initialProps: { open: overlayOpen } },
    );

    // First Escape: overlay open → close it, do not exit.
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(closeOverlay).toHaveBeenCalledTimes(1);
    expect(onExit).not.toHaveBeenCalled();

    // Overlay is now closed; rerender to reflect it.
    overlayOpen = false;
    rerender({ open: overlayOpen });

    // Second Escape: no overlay → exit.
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(closeOverlay).toHaveBeenCalledTimes(1);
  });

  it('in fullscreen, Escape exits fullscreen and does NOT exit the reader', () => {
    const onExit = vi.fn();
    const exitFullscreen = vi.fn().mockResolvedValue(undefined);
    const doc = document as unknown as {
      fullscreenElement: Element | null;
      exitFullscreen: () => Promise<void>;
    };
    doc.fullscreenElement = document.body;
    doc.exitFullscreen = exitFullscreen;

    renderHook(() => useReaderEscape({ overlayOpen: false, closeOverlay: vi.fn(), onExit }));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
    expect(onExit).not.toHaveBeenCalled();

    // No longer fullscreen: the next Escape exits the reader.
    doc.fullscreenElement = null;
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('does not exit the reader when fullscreen=true even if fullscreenElement is already null', () => {
    // The core race: React still reports fullscreen=true during the synchronous
    // keydown, while document.fullscreenElement has already been cleared.
    const onExit = vi.fn();
    const doc = document as unknown as { fullscreenElement: Element | null };
    doc.fullscreenElement = null;
    renderHook(() =>
      useReaderEscape({ overlayOpen: false, closeOverlay: vi.fn(), onExit, fullscreen: true }),
    );
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onExit).not.toHaveBeenCalled();
  });

  it('swallows the trailing Escape that just left fullscreen (race)', () => {
    const onExit = vi.fn();
    const doc = document as unknown as { fullscreenElement: Element | null };
    doc.fullscreenElement = null; // browser already cleared it before the keydown
    renderHook(() => useReaderEscape({ overlayOpen: false, closeOverlay: vi.fn(), onExit }));
    act(() => {
      // fullscreenchange (exit) lands first, then the same Escape keydown.
      document.dispatchEvent(new Event('fullscreenchange'));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onExit).not.toHaveBeenCalled(); // swallowed — stays in the reader
  });

  it('ignores non-Escape keys', () => {
    const closeOverlay = vi.fn();
    const onExit = vi.fn();
    renderHook(() => useReaderEscape({ overlayOpen: false, closeOverlay, onExit }));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    });
    expect(onExit).not.toHaveBeenCalled();
    expect(closeOverlay).not.toHaveBeenCalled();
  });

  it('removes its listener on unmount', () => {
    const onExit = vi.fn();
    const { unmount } = renderHook(() =>
      useReaderEscape({ overlayOpen: false, closeOverlay: vi.fn(), onExit }),
    );
    unmount();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onExit).not.toHaveBeenCalled();
  });
});

describe('useFullscreen', () => {
  let requestSpy: ReturnType<typeof vi.fn>;
  let exitSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    requestSpy = vi.fn().mockResolvedValue(undefined);
    exitSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      writable: true,
      value: null,
    });
    document.exitFullscreen = exitSpy as unknown as typeof document.exitFullscreen;
    document.documentElement.requestFullscreen =
      requestSpy as unknown as typeof document.documentElement.requestFullscreen;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requests fullscreen on the ref element when not fullscreen', () => {
    const el = document.createElement('div');
    el.requestFullscreen = requestSpy as unknown as typeof el.requestFullscreen;
    const ref = createRef<HTMLDivElement>();
    Object.defineProperty(ref, 'current', { value: el, writable: true });

    const { result } = renderHook(() => useFullscreen(ref));
    expect(result.current.fullscreen).toBe(false);
    act(() => result.current.toggleFullscreen());
    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('exits fullscreen when already fullscreen', () => {
    const ref = createRef<HTMLDivElement>();
    const { result } = renderHook(() => useFullscreen(ref));
    (document as unknown as { fullscreenElement: Element | null }).fullscreenElement =
      document.documentElement;
    act(() => result.current.toggleFullscreen());
    expect(exitSpy).toHaveBeenCalledTimes(1);
  });

  it('reflects fullscreenchange events in its state', () => {
    const ref = createRef<HTMLDivElement>();
    const { result } = renderHook(() => useFullscreen(ref));
    expect(result.current.fullscreen).toBe(false);
    act(() => {
      (document as unknown as { fullscreenElement: Element | null }).fullscreenElement =
        document.documentElement;
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(result.current.fullscreen).toBe(true);
  });
});

describe('ReaderTopBar bookmark control', () => {
  it('renders the bookmark as an icon button (no solid blob) and toggles fill when active', () => {
    const m = pagedManifest();
    const { rerender } = render(
      <ReaderTopBar manifest={m} bookmarked={false} onBookmark={vi.fn()} />,
    );
    const btn = screen.getByLabelText('Bookmark');
    // Idle: transparent background (not a permanent accent blob).
    expect(btn.style.background).toBe('transparent');
    expect(btn.getAttribute('aria-pressed')).toBe('false');

    rerender(<ReaderTopBar manifest={m} bookmarked onBookmark={vi.fn()} />);
    const active = screen.getByLabelText('Bookmark');
    // Active: subtle accent tint via color-mix, not the page-colored solid fill.
    expect(active.style.background).toContain('color-mix');
    expect(active.getAttribute('aria-pressed')).toBe('true');
  });

  it('shows the shrink glyph and calls onFullscreen when fullscreen', () => {
    const onFullscreen = vi.fn();
    const m = pagedManifest();
    render(
      <ReaderTopBar
        manifest={m}
        bookmarked={false}
        onFullscreen={onFullscreen}
        fullscreen
      />,
    );
    fireEvent.click(screen.getByLabelText('Fullscreen'));
    expect(onFullscreen).toHaveBeenCalledTimes(1);
  });
});
