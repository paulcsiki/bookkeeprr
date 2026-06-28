import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { useDiscoverBrowse } from '@/api/hooks/useDiscoverBrowse';
import { AuthProvider } from '@/auth/AuthContext';
import { server } from '../../mocks/server';

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

const wrapper = ({ children }: { children: ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <AuthProvider>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </AuthProvider>
  );
};

const MOCK_BROWSE_RESPONSE = {
  rows: [
    {
      id: 'trending',
      label: 'Trending now',
      meta: 'Across all sources',
      items: [
        {
          contentType: 'manga',
          sourceId: '1',
          title: 'Mock Manga',
          year: 2020,
          author: 'Test Author',
          isbn: null,
          coverUrl: 'https://example.com/cover.jpg',
          source: 'anilist',
          detail: '2020 · RELEASING',
          inLib: false,
        },
      ],
    },
    {
      id: 'popular',
      label: 'Popular this season',
      meta: 'AniList · top 50',
      items: [
        {
          contentType: 'light_novel',
          sourceId: '2',
          title: 'Mock Novel',
          year: 2019,
          author: 'Novel Author',
          isbn: null,
          coverUrl: null,
          source: 'anilist',
          detail: '2019',
          inLib: true,
        },
      ],
    },
    {
      id: 'fresh',
      label: 'New this week',
      meta: 'Recent entries',
      items: [
        {
          contentType: 'ebook',
          sourceId: 'OL1W',
          title: 'Mock Ebook',
          year: 2024,
          author: 'Ebook Author',
          isbn: '9781234567890',
          coverUrl: null,
          source: 'openlibrary',
          detail: '2024',
          inLib: false,
        },
      ],
    },
  ],
};

describe('useDiscoverBrowse', () => {
  beforeEach(() => {
    server.use(
      http.get('https://srv/api/discover/browse', () =>
        HttpResponse.json(MOCK_BROWSE_RESPONSE),
      ),
    );
  });

  it('fetches and parses 3 browse rows', async () => {
    const { result } = await renderHook(() => useDiscoverBrowse(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.rows).toHaveLength(3);
  });

  it('maps light_novel contentType to novel', async () => {
    const { result } = await renderHook(() => useDiscoverBrowse(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const popularRow = result.current.data?.rows.find((r) => r.id === 'popular');
    expect(popularRow?.items[0]?.contentType).toBe('novel');
  });

  it('preserves inLib flag', async () => {
    const { result } = await renderHook(() => useDiscoverBrowse(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const popularRow = result.current.data?.rows.find((r) => r.id === 'popular');
    expect(popularRow?.items[0]?.inLib).toBe(true);
  });

  it('preserves detail field', async () => {
    const { result } = await renderHook(() => useDiscoverBrowse(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const trendingRow = result.current.data?.rows.find((r) => r.id === 'trending');
    expect(trendingRow?.items[0]?.detail).toBe('2020 · RELEASING');
  });

  it('preserves coverUrl field', async () => {
    const { result } = await renderHook(() => useDiscoverBrowse(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const trendingRow = result.current.data?.rows.find((r) => r.id === 'trending');
    expect(trendingRow?.items[0]?.coverUrl).toBe('https://example.com/cover.jpg');
  });
});
