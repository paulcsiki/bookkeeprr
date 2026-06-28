/** @vitest-environment jsdom */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DiscoverClient } from '@/app/(app)/discover/DiscoverClient';

// Capture every IntersectionObserver instance so a test can fire its callback
// manually (jsdom has no layout, so observers never naturally "intersect").
const observers: Array<{ cb: IntersectionObserverCallback }> = [];

class FakeIntersectionObserver {
  cb: IntersectionObserverCallback;
  constructor(cb: IntersectionObserverCallback) {
    this.cb = cb;
    observers.push({ cb });
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderWithQuery(ui: React.ReactNode) {
  const qc = makeQueryClient();
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

// Builds a browse item (BrowseResultItem-compatible) with a unique title.
function browseItem(title: string) {
  return {
    contentType: 'manga' as const,
    sourceId: title,
    title,
    year: 2020,
    author: 'Some Author',
    coverUrl: null,
    source: 'anilist',
    detail: '2020',
    inLib: false,
  };
}

// A stub fetch: sources + one browse row, plus a paginated category endpoint.
// Page 1 → page1 items + hasMore:true; page 2 → page2 items + hasMore:false.
function stubFetch(page1: string[], page2: string[]) {
  return vi.fn(async (url: string) => {
    const u = url.toString();
    if (u.includes('/api/discover/sources')) {
      return new Response(JSON.stringify({ sources: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (u.includes('/api/discover/category')) {
      const pageNum = Number(new URL(u, 'http://x').searchParams.get('page'));
      const items = (pageNum === 1 ? page1 : pageNum === 2 ? page2 : []).map(browseItem);
      const hasMore = pageNum === 1;
      return new Response(JSON.stringify({ items, hasMore }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (u.includes('/api/discover/browse')) {
      return new Response(
        JSON.stringify({
          rows: [
            {
              id: 'trending',
              label: 'Trending now',
              meta: 'AniList · trending',
              items: [browseItem('Row Tile A')],
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response('{}', { status: 404 });
  });
}

describe('Discover category (See all) infinite scroll', () => {
  afterEach(() => {
    observers.length = 0;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('enters category mode on See all, renders page-1 tiles, and the sentinel triggers page 2', async () => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    vi.stubGlobal('fetch', stubFetch(['Page1 Title'], ['Page2 Title']));

    renderWithQuery(<DiscoverClient />);

    // Wait for the browse row + its "See all" button.
    await waitFor(() => {
      expect(screen.queryByText(/See all/)).toBeTruthy();
    }, { timeout: 5000 });
    fireEvent.click(screen.getByText(/See all/));

    // Category header + first page tiles render. (Each tile renders its title
    // twice: the visible label + the Cover fallback's title span — so assert on
    // the count being non-zero rather than a single match.)
    await waitFor(() => {
      expect(screen.queryAllByText('Page1 Title').length).toBeGreaterThan(0);
    }, { timeout: 5000 });
    // Second page not yet fetched.
    expect(screen.queryAllByText('Page2 Title').length).toBe(0);

    // Fire the IntersectionObserver callback to simulate the sentinel scrolling
    // into view → fetchNextPage → page 2.
    await waitFor(() => expect(observers.length).toBeGreaterThan(0), { timeout: 5000 });
    for (const o of observers) {
      o.cb(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    }

    await waitFor(() => {
      expect(screen.queryAllByText('Page2 Title').length).toBeGreaterThan(0);
    }, { timeout: 5000 });
  }, 30000);
});
