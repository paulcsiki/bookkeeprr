'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

export interface PdfSurfaceProps {
  fileId: number;
  /** 0-based current page index. */
  page: number;
  /** Reports the document's true page count once the PDF opens. */
  onNumPages: (n: number) => void;
  /** Tap-zone navigation resolved to prev / next / toggle chrome. */
  onTap: (action: 'prev' | 'next' | 'toggle') => void;
}

/** A render operation we can cancel when superseded. */
type RenderTask = { promise: Promise<void>; cancel: () => void };

/** The minimal pdf.js surface this component relies on. */
type PdfDoc = {
  numPages: number;
  getPage: (n: number) => Promise<{
    getViewport: (opts: { scale: number }) => { width: number; height: number };
    render: (opts: {
      canvasContext: CanvasRenderingContext2D;
      viewport: { width: number; height: number };
    }) => RenderTask;
  }>;
  destroy?: () => void | Promise<void>;
};

/**
 * Renders a PDF to a canvas via pdf.js. The library + worker are dynamically
 * imported on the client (kept out of the server bundle), the document is
 * opened from the streaming `/api/reader/pdf/<fileId>` route, and the current
 * page is rasterized to a `<canvas>` at the container's device-pixel size. A
 * transparent overlay captures tap-zone nav.
 */
export function PdfSurface({ fileId, page, onNumPages, onTap }: PdfSurfaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<PdfDoc | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const mountedRef = useRef(true);
  const [ready, setReady] = useState(false);

  const onNumPagesRef = useRef(onNumPages);
  onNumPagesRef.current = onNumPages;

  // Open the document once per file. Destroy the worker-side document on
  // unmount / file change so it isn't leaked when navigating away.
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    let loadingTask: { destroy?: () => void } | null = null;
    let openedDoc: PdfDoc | null = null;
    (async () => {
      const { ensurePdfWorker } = await import('./lib/pdf-worker');
      const pdfjs = ensurePdfWorker();
      const task = pdfjs.getDocument({ url: `/api/reader/pdf/${fileId}` });
      loadingTask = task as unknown as { destroy?: () => void };
      const doc = (await task.promise) as unknown as PdfDoc;
      openedDoc = doc;
      if (cancelled) {
        // Lost the race with unmount — release the doc we just opened.
        void doc.destroy?.();
        return;
      }
      docRef.current = doc;
      onNumPagesRef.current(doc.numPages);
      setReady(true);
    })().catch(() => {
      /* swallow — surfaced via e2e; component stays mounted */
    });
    return () => {
      cancelled = true;
      mountedRef.current = false;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      docRef.current = null;
      void openedDoc?.destroy?.();
      loadingTask?.destroy?.();
    };
  }, [fileId]);

  // Render the current page whenever it (or readiness) changes. A new render
  // cancels any in-flight one first so fast page turns can't run two renders
  // against the same canvas (pdf.js throws on overlapping render() calls).
  const renderPage = useCallback(async () => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!doc || !canvas || !container) return;

    // Cancel any in-flight render and wait for it to settle before reusing
    // the canvas. The rejection is the expected cancellation signal.
    const prev = renderTaskRef.current;
    if (prev) {
      prev.cancel();
      await prev.promise.catch(() => {});
      if (!mountedRef.current || renderTaskRef.current !== prev) {
        // Superseded again (or unmounted) while awaiting — let the latest win.
        if (renderTaskRef.current === prev) renderTaskRef.current = null;
      }
    }
    if (!mountedRef.current) return;

    const clamped = Math.max(0, Math.min(doc.numPages - 1, page));
    const pdfPage = await doc.getPage(clamped + 1);
    if (!mountedRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const base = pdfPage.getViewport({ scale: 1 });
    const cw = container.clientWidth || base.width;
    const ch = container.clientHeight || base.height;
    const scale = Math.min(cw / base.width, ch / base.height) || 1;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const viewport = pdfPage.getViewport({ scale: scale * dpr });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${viewport.width / dpr}px`;
    canvas.style.height = `${viewport.height / dpr}px`;
    const task = pdfPage.render({ canvasContext: ctx, viewport });
    renderTaskRef.current = task;
    try {
      await task.promise;
    } catch {
      /* cancelled by a newer render or unmount — ignore */
    } finally {
      if (renderTaskRef.current === task) renderTaskRef.current = null;
    }
  }, [page]);

  useEffect(() => {
    if (!ready) return;
    void renderPage();
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => void renderPage());
    ro.observe(container);
    return () => ro.disconnect();
  }, [ready, renderPage]);

  const onOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      if (r.width <= 0) return;
      const rel = (e.clientX - r.left) / r.width;
      if (rel < 0.3) onTap('prev');
      else if (rel > 0.7) onTap('next');
      else onTap('toggle');
    },
    [onTap],
  );

  const containerStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    display: 'grid',
    placeItems: 'center',
    overflow: 'hidden',
    background: 'var(--reader-page)',
  };

  return (
    <div ref={containerRef} style={containerStyle}>
      <canvas ref={canvasRef} style={{ display: 'block' }} />
      <div
        aria-hidden
        onClick={onOverlayClick}
        style={{ position: 'absolute', inset: 0, cursor: 'pointer' }}
      />
    </div>
  );
}
