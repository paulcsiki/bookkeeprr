/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// --- foliate-js mock -------------------------------------------------------
// A fake `<foliate-view>` custom element that records the API calls the
// FoliateSurface drives (open / goToFraction / next / prev) and lets the test
// fire a `relocate` event. No real foliate binary / ebook parser needed.
const opened: unknown[] = [];
const goToFractionCalls: number[] = [];
const goToCalls: string[] = [];
const setStylesCalls: string[] = [];
let lastInstance: FakeFoliateView | null = null;

class FakeFoliateView extends HTMLElement {
  book = {
    dir: 'ltr',
    toc: [
      { label: 'Part One', href: 'p1', subitems: [{ label: 'Chapter 1', href: 'ch1' }] },
      { label: 'Chapter 2', href: 'ch2' },
    ],
  };
  renderer = {
    setStyles: (css: string) => {
      setStylesCalls.push(css);
    },
    setAttribute: () => {},
    next: () => Promise.resolve(),
  };
  async open(file: unknown) {
    opened.push(file);
    lastInstance = this; // eslint-disable-line @typescript-eslint/no-this-alias
  }
  async goToFraction(frac: number) {
    goToFractionCalls.push(frac);
  }
  async goTo(href: string) {
    goToCalls.push(href);
  }
  async next() {}
  async prev() {}
  close() {}
  /** Test helper: dispatch a foliate relocate event carrying a fraction. */
  fireRelocate(fraction: number, location?: { current: number; total: number }) {
    this.dispatchEvent(new CustomEvent('relocate', { detail: { fraction, location } }));
  }
}

vi.mock('foliate-js/view.js', () => {
  if (!customElements.get('foliate-view')) {
    customElements.define('foliate-view', FakeFoliateView);
  }
  return {};
});

// useProgress persists through apiFetch (PUT /api/reader/progress/...).
const apiFetch = vi.fn(
  async (_url: string, _init?: RequestInit) => new Response('{}', { status: 200 }),
);
vi.mock('@/lib/api-fetch', () => ({
  apiFetch: (url: string, init?: RequestInit) => apiFetch(url, init),
}));

import { TextReader } from '@/components/reader/TextReader';

const FILE_ID = 42;
const RESUME_FRAC = 0.37;

function mobiManifest() {
  return {
    readableKey: `page:file:${FILE_ID}`,
    contentType: 'novel',
    reader: 'text' as const,
    format: 'mobi' as const,
    title: 'Sabriel',
    seriesId: 9,
    volumeId: 3,
    progress: {
      readableKey: `page:file:${FILE_ID}`,
      position: RESUME_FRAC,
      locator: { frac: RESUME_FRAC },
      finished: false,
      restartedFromFinish: false,
    },
  };
}

function renderReader() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <TextReader manifest={mobiManifest() as never} />
    </QueryClientProvider>,
  );
}

describe('TextReader — foliate (mobi/azw3) branch', () => {
  beforeEach(() => {
    opened.length = 0;
    goToFractionCalls.length = 0;
    goToCalls.length = 0;
    setStylesCalls.length = 0;
    lastInstance = null;
    apiFetch.mockClear();
    // The download route is fetched with raw fetch + credentials:'include'.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (typeof url === 'string' && url.includes('/api/reader/ebook/')) {
          return new Response(new ArrayBuffer(8), { status: 200 });
        }
        return new Response('{}', { status: 200 });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches the download route, resumes via goToFraction, and commits a frac locator on relocate', async () => {
    renderReader();

    // Renders the foliate surface (not the EPUB iframe / PDF canvas).
    expect(await screen.findByTestId('foliate-surface')).toBeTruthy();

    // Fetches the whole-file download route with credentials.
    await waitFor(() => {
      const f = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
      const call = (f.mock.calls as Array<[string, RequestInit?]>).find(
        (c) => typeof c[0] === 'string' && c[0].includes(`/api/reader/ebook/${FILE_ID}/download`),
      );
      expect(call).toBeTruthy();
      expect(call?.[1]?.credentials).toBe('include');
    });

    // Opens the fetched buffer and resumes at the manifest's starting fraction.
    await waitFor(() => {
      expect(opened.length).toBe(1);
      expect(goToFractionCalls).toContain(RESUME_FRAC);
    });

    // Theme/font are injected into foliate's content document via setStyles
    // (shared reader settings reuse — not a separate styling path).
    await waitFor(() => {
      expect(setStylesCalls.length).toBeGreaterThan(0);
      expect(setStylesCalls.some((css) => css.includes('font-family'))).toBe(true);
    });

    // A relocate event commits progress as a `{ frac }` locator.
    expect(lastInstance).toBeTruthy();
    await act(async () => {
      lastInstance?.fireRelocate(0.55);
      // Flush the ~800ms progress debounce.
      await new Promise((r) => setTimeout(r, 900));
    });

    await waitFor(() => {
      const put = (apiFetch.mock.calls as Array<[string, RequestInit?]>).find(
        (c) => typeof c[0] === 'string' && c[0].includes('/api/reader/progress/'),
      );
      expect(put).toBeTruthy();
      const body = JSON.parse(put?.[1]?.body as string);
      expect(body.position).toBeCloseTo(0.55, 5);
      expect(body.locator).toEqual({ frac: 0.55 });
    });
  });

  it('renders foliate\'s Kindle-style location ("X / Y", 1-based) as the left rail label', async () => {
    renderReader();
    expect(await screen.findByTestId('foliate-surface')).toBeTruthy();
    await waitFor(() => expect(lastInstance).toBeTruthy());

    // A relocate carrying location {current:4,total:120} renders "5 / 120"
    // (current is 0-based; the readout is 1-based).
    await act(async () => {
      lastInstance?.fireRelocate(0.04, { current: 4, total: 120 });
      await new Promise((r) => setTimeout(r, 0));
    });

    await waitFor(() => {
      expect(screen.getByText('5 / 120')).toBeTruthy();
    });
  });

  it('renders book.toc in the shared TOC panel and jumps via view.goTo on tap', async () => {
    renderReader();
    expect(await screen.findByTestId('foliate-surface')).toBeTruthy();
    await waitFor(() => expect(lastInstance).toBeTruthy());

    // Open the shared chrome's Contents panel (the TOC button is labelled
    // "Contents"). Multiple instances may render across breakpoints; click all.
    await waitFor(() => expect(screen.getAllByLabelText('Contents').length).toBeGreaterThan(0));
    await act(async () => {
      for (const btn of screen.getAllByLabelText('Contents')) fireEvent.click(btn);
    });

    // The flattened, depth-tagged TOC renders (top-level + nested subitem).
    await waitFor(() => {
      expect(screen.getByText('Part One')).toBeTruthy();
      expect(screen.getByText('Chapter 1')).toBeTruthy();
      expect(screen.getByText('Chapter 2')).toBeTruthy();
    });

    // Tapping an entry navigates via view.goTo(href).
    await act(async () => {
      fireEvent.click(screen.getByText('Chapter 1'));
    });
    await waitFor(() => {
      expect(goToCalls).toContain('ch1');
    });
  });
});
