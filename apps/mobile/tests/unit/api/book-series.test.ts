import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import React from 'react';
import { AuthProvider } from '@/auth/AuthContext';
import { BookSeriesListResponse, BookSeriesDetailResponse } from '@/api/schemas/book-series';
import {
  useBookSeriesList,
  useBookSeries,
  useAssignToBookSeries,
  useRemoveFromBookSeries,
  useRefreshBookSeries,
} from '@/api/hooks/useBookSeries';

jest.mock('@/auth/token-store', () => ({
  tokenStore: {
    load: jest.fn().mockResolvedValue({
      serverUrl: 'https://srv',
      token: 't',
      refreshToken: 'r',
      expiresAt: '2026-08-25T00:00:00Z',
      certFingerprint: null,
    }),
    save: jest.fn(),
    clear: jest.fn(),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return React.createElement(
    AuthProvider,
    null,
    React.createElement(QueryClientProvider, { client: qc }, children),
  );
}

function mockFetch(responseBody: unknown, status = 200): jest.Mock {
  const mock = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => responseBody,
  });
  (globalThis as unknown as { fetch: jest.Mock }).fetch = mock;
  return mock;
}

const WAIT_OPTS = { timeout: 5000 } as const;

// ─── Schema tests ─────────────────────────────────────────────────────────────

describe('BookSeriesListResponse schema', () => {
  const validSummary = {
    id: 1,
    name: 'The Stormlight Archive',
    contentType: 'ebook',
    coverUrl: 'https://example.com/cover.jpg',
    totalBooks: 5,
    memberCount: 3,
    source: 'manual',
  };

  it('parses a valid list response', () => {
    const r = BookSeriesListResponse.parse({ bookSeries: [validSummary] });
    expect(r.bookSeries).toHaveLength(1);
    expect(r.bookSeries[0]?.name).toBe('The Stormlight Archive');
    expect(r.bookSeries[0]?.contentType).toBe('ebook');
  });

  it('parses an empty list', () => {
    const r = BookSeriesListResponse.parse({ bookSeries: [] });
    expect(r.bookSeries).toHaveLength(0);
  });

  it('rejects an invalid contentType', () => {
    expect(() =>
      BookSeriesListResponse.parse({
        bookSeries: [{ ...validSummary, contentType: 'manga' }],
      }),
    ).toThrow();
  });

  it('rejects a summary with missing required fields', () => {
    expect(() =>
      BookSeriesListResponse.parse({
        bookSeries: [{ id: 1, name: 'x' }],
      }),
    ).toThrow();
  });
});

describe('BookSeriesDetailResponse schema', () => {
  const validEntry = {
    position: 1,
    title: 'The Way of Kings',
    externalRef: 'ol-1234',
    coverUrl: 'https://example.com/twok.jpg',
    owned: true,
    seriesId: 42,
  };

  const validDetail = {
    id: 1,
    name: 'The Stormlight Archive',
    contentType: 'ebook',
    coverUrl: null,
    totalBooks: 5,
    memberCount: 1,
    source: 'manual',
    description: 'Epic fantasy series',
    books: [validEntry],
  };

  it('parses a valid detail response', () => {
    const r = BookSeriesDetailResponse.parse(validDetail);
    expect(r.id).toBe(1);
    expect(r.description).toBe('Epic fantasy series');
    expect(r.books).toHaveLength(1);
    expect(r.books[0]?.title).toBe('The Way of Kings');
    expect(r.books[0]?.owned).toBe(true);
    expect(r.books[0]?.seriesId).toBe(42);
  });

  it('parses a detail with null fields', () => {
    const r = BookSeriesDetailResponse.parse({
      ...validDetail,
      coverUrl: null,
      description: null,
      books: [
        {
          ...validEntry,
          position: null,
          externalRef: null,
          coverUrl: null,
          seriesId: null,
        },
      ],
    });
    expect(r.coverUrl).toBeNull();
    expect(r.description).toBeNull();
    expect(r.books[0]?.position).toBeNull();
    expect(r.books[0]?.seriesId).toBeNull();
  });

  it('rejects detail with missing books field', () => {
    const withoutBooks: Record<string, unknown> = { ...validDetail };
    delete withoutBooks.books;
    expect(() => BookSeriesDetailResponse.parse(withoutBooks)).toThrow();
  });
});

// ─── Hook tests ───────────────────────────────────────────────────────────────

describe('useBookSeriesList', () => {
  it('GETs /api/book-series and returns parsed list', async () => {
    const fetchMock = mockFetch({
      bookSeries: [
        {
          id: 1,
          name: 'Wheel of Time',
          contentType: 'ebook',
          coverUrl: null,
          totalBooks: 14,
          memberCount: 14,
          source: 'manual',
        },
      ],
    });

    const { result } = await renderHook(() => useBookSeriesList(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true), WAIT_OPTS);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('https://srv/api/book-series');
    expect(result.current.data?.bookSeries).toHaveLength(1);
    expect(result.current.data?.bookSeries[0]?.name).toBe('Wheel of Time');
  });

  it('appends contentType query param when provided', async () => {
    const fetchMock = mockFetch({ bookSeries: [] });

    await renderHook(() => useBookSeriesList('audiobook'), { wrapper });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), WAIT_OPTS);

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('https://srv/api/book-series?contentType=audiobook');
  });
});

describe('useBookSeries', () => {
  it('GETs /api/book-series/{id} and returns parsed detail', async () => {
    const fetchMock = mockFetch({
      id: 7,
      name: 'Mistborn',
      contentType: 'ebook',
      coverUrl: null,
      totalBooks: 6,
      memberCount: 3,
      source: 'manual',
      description: 'Brandon Sanderson epic fantasy',
      books: [],
    });

    const { result } = await renderHook(() => useBookSeries(7), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true), WAIT_OPTS);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('https://srv/api/book-series/7');
    expect(result.current.data?.name).toBe('Mistborn');
    expect(result.current.data?.books).toEqual([]);
  });

  it('does not fetch when id is undefined', async () => {
    const fetchMock = mockFetch({});

    await renderHook(() => useBookSeries(undefined), { wrapper });
    // Give it a tick to confirm no fetch
    await new Promise((r) => setTimeout(r, 50));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('useAssignToBookSeries', () => {
  it('POSTs /api/book-series/{id}/members with seriesId and position', async () => {
    const fetchMock = mockFetch({
      id: 3,
      name: 'Test',
      contentType: 'ebook',
      coverUrl: null,
      totalBooks: null,
      memberCount: 1,
      source: 'manual',
      description: null,
      books: [],
    });

    const { result } = await renderHook(() => useAssignToBookSeries(), { wrapper });
    await waitFor(() => expect(result.current.mutateAsync).toBeDefined(), WAIT_OPTS);

    await act(async () => {
      await result.current.mutateAsync({ bookSeriesId: 3, seriesId: 99, position: 1 });
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://srv/api/book-series/3/members');
    expect((init as RequestInit & { method: string }).method).toBe('POST');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toHaveProperty('seriesId', 99);
    expect(body).toHaveProperty('position', 1);
  });

  it('omits position when not provided', async () => {
    const fetchMock = mockFetch({ ok: true });

    const { result } = await renderHook(() => useAssignToBookSeries(), { wrapper });
    await waitFor(() => expect(result.current.mutateAsync).toBeDefined(), WAIT_OPTS);

    await act(async () => {
      await result.current.mutateAsync({ bookSeriesId: 3, seriesId: 99 });
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).not.toHaveProperty('position');
  });
});

describe('useRemoveFromBookSeries', () => {
  it('DELETEs /api/book-series/{id}/members/{seriesId}', async () => {
    const fetchMock = mockFetch({ ok: true });

    const { result } = await renderHook(() => useRemoveFromBookSeries(), { wrapper });
    await waitFor(() => expect(result.current.mutateAsync).toBeDefined(), WAIT_OPTS);

    await act(async () => {
      await result.current.mutateAsync({ bookSeriesId: 5, seriesId: 42 });
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://srv/api/book-series/5/members/42');
    expect((init as RequestInit & { method: string }).method).toBe('DELETE');
  });
});

describe('useRefreshBookSeries', () => {
  it('POSTs /api/book-series/{id}/refresh', async () => {
    const fetchMock = mockFetch({ ok: true, enqueued: 3 });

    const { result } = await renderHook(() => useRefreshBookSeries(), { wrapper });
    await waitFor(() => expect(result.current.mutateAsync).toBeDefined(), WAIT_OPTS);

    await act(async () => {
      await result.current.mutateAsync({ bookSeriesId: 11 });
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://srv/api/book-series/11/refresh');
    expect((init as RequestInit & { method: string }).method).toBe('POST');
  });
});
