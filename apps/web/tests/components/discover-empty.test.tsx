/** @vitest-environment jsdom */
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DiscoverClient } from '@/app/(app)/discover/DiscoverClient';

// Helper: create a fresh QueryClient (no retries, no caching) for isolated tests.
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderWithQuery(ui: React.ReactNode) {
  const qc = makeQueryClient();
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

// Stub fetch: sources returns 5 configured; search returns empty results.
function stubFetch(opts: { searchResults?: unknown[] } = {}) {
  const results = opts.searchResults ?? [];
  return vi.fn(async (url: string) => {
    const u = url.toString();
    if (u.includes('/api/discover/sources')) {
      return new Response(
        JSON.stringify({
          sources: [
            { id: 'anilist',     label: 'AniList',     configured: true },
            { id: 'mangadex',    label: 'MangaDex',    configured: true },
            { id: 'comicvine',   label: 'ComicVine',   configured: false },
            { id: 'openlibrary', label: 'OpenLibrary',  configured: true },
            { id: 'audnex',      label: 'Audnex',       configured: true },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (u.includes('/api/discover/search')) {
      return new Response(
        JSON.stringify({ results, tookMs: 12 }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response('{}', { status: 404 });
  });
}

describe('Discover empty results', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders the search input on mount', () => {
    vi.stubGlobal('fetch', stubFetch());
    renderWithQuery(<DiscoverClient />);
    expect(screen.getByPlaceholderText(/AniList/)).toBeTruthy();
  });

  it('does not show Clear filters button when results are present', async () => {
    const searchResults = Array.from({ length: 7 }, (_, i) => ({
      contentType: 'light_novel',
      sourceId: String(i + 1),
      title: `Classroom of the Elite, Vol. ${i + 1}`,
      year: 2016,
      author: 'Shōgo Kinugasa',
      coverUrl: null,
      source: 'anilist',
    }));
    vi.stubGlobal('fetch', stubFetch({ searchResults }));

    renderWithQuery(<DiscoverClient />);

    // Trigger a search.
    const input = screen.getByPlaceholderText(/AniList/);
    fireEvent.change(input, { target: { value: 'Classroom of the Elite' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // Wait for the results mode to appear (API call resolves).
    await waitFor(() => {
      expect(screen.queryByText(/results/i)).toBeTruthy();
    }, { timeout: 5000 });

    // With 7 results and 'all' filter, no EmptyState is shown.
    expect(screen.queryByRole('button', { name: /Clear filters/ })).toBeNull();
  });

  it('shows EmptyState with Clear-filters button when zero results', async () => {
    vi.stubGlobal('fetch', stubFetch({ searchResults: [] }));

    renderWithQuery(<DiscoverClient />);

    const input = screen.getByPlaceholderText(/AniList/);
    fireEvent.change(input, { target: { value: 'something with no results' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // Wait for results mode with 0 results — EmptyState should appear.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Clear filters/ })).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('shows the searching loader while query is in-flight', async () => {
    // Delay the search response so we can assert the loader is visible.
    let resolveSearch!: (v: Response) => void;
    const searchPromise = new Promise<Response>((res) => { resolveSearch = res; });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = url.toString();
      if (u.includes('/api/discover/sources')) {
        return new Response(JSON.stringify({ sources: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (u.includes('/api/discover/search')) {
        return searchPromise;
      }
      return new Response('{}', { status: 404 });
    }));

    renderWithQuery(<DiscoverClient />);

    const input = screen.getByPlaceholderText(/AniList/);
    fireEvent.change(input, { target: { value: 'test query' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // The RiffleLoader renders while mode === 'searching'.
    // We look for the scanning text that shows the query.
    await waitFor(() => {
      expect(screen.queryByText(/"test query"/)).toBeTruthy();
    }, { timeout: 2000 });

    // Resolve to avoid act() warnings.
    await act(async () => {
      resolveSearch(
        new Response(JSON.stringify({ results: [], tookMs: 5 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });
  });
});
