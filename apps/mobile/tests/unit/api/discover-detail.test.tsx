/**
 * Unit tests for useDiscoverDetail:
 *   - Verifies correct URL / query-param construction (contentType conversion,
 *     source, id, title, mdexId when sources.mangadex is set).
 *   - Verifies the zod DiscoverDetailSchema accepts and rejects the expected shapes.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { useDiscoverDetail, DiscoverDetailSchema } from '@/api/hooks/useDiscoverDetail';
import type { DiscoverResultItem } from '@/api/hooks/useDiscoverSearch';
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

// ---------------------------------------------------------------------------
// Schema parse tests (no network)
// ---------------------------------------------------------------------------

describe('DiscoverDetailSchema', () => {
  it('accepts a full detail response', () => {
    const result = DiscoverDetailSchema.safeParse({
      description: 'A great story.',
      totalVolumes: 12,
      totalChapters: 144,
      mangadexId: 'abc-123',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe('A great story.');
      expect(result.data.totalVolumes).toBe(12);
      expect(result.data.totalChapters).toBe(144);
      expect(result.data.mangadexId).toBe('abc-123');
    }
  });

  it('accepts an empty response (best-effort, all fields optional)', () => {
    const result = DiscoverDetailSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts null fields', () => {
    const result = DiscoverDetailSchema.safeParse({
      description: null,
      totalVolumes: null,
      totalChapters: null,
      mangadexId: null,
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// URL / param building tests (with MSW)
// ---------------------------------------------------------------------------

function makeResult(overrides: Partial<DiscoverResultItem> = {}): DiscoverResultItem {
  return {
    contentType: 'manga',
    sourceId: '12345',
    title: 'Test Manga',
    year: 2022,
    author: 'Test Author',
    isbn: null,
    coverUrl: null,
    source: 'anilist',
    detail: null,
    inLib: false,
    sources: null,
    malId: null,
    ...overrides,
  };
}

describe('useDiscoverDetail URL construction', () => {
  it('sends contentType=manga, source, id for a manga result', async () => {
    let capturedUrl: URL | null = null;
    server.use(
      http.get('https://srv/api/discover/detail', ({ request }) => {
        capturedUrl = new URL(request.url);
        return HttpResponse.json({ description: 'Synopsis here.', totalVolumes: 5 });
      }),
    );

    const result = makeResult();
    const { result: hookResult } = await renderHook(() => useDiscoverDetail(result, true), { wrapper });
    await waitFor(() => expect(hookResult.current.isSuccess).toBe(true));

    expect(capturedUrl).not.toBeNull();
    expect(capturedUrl!.searchParams.get('contentType')).toBe('manga');
    expect(capturedUrl!.searchParams.get('source')).toBe('anilist');
    expect(capturedUrl!.searchParams.get('id')).toBe('12345');
    expect(capturedUrl!.searchParams.get('title')).toBe('Test Manga');
    // No mdexId when sources.mangadex is null.
    expect(capturedUrl!.searchParams.get('mdexId')).toBeNull();
    expect(hookResult.current.data?.description).toBe('Synopsis here.');
  });

  it('maps mobile short-forms: novel → light_novel', async () => {
    let capturedUrl: URL | null = null;
    server.use(
      http.get('https://srv/api/discover/detail', ({ request }) => {
        capturedUrl = new URL(request.url);
        return HttpResponse.json({});
      }),
    );

    const novelResult = makeResult({ contentType: 'novel', source: 'anilist', sourceId: '999' });
    const { result: novelHook } = await renderHook(() => useDiscoverDetail(novelResult, true), { wrapper });
    await waitFor(() => expect(novelHook.current.isSuccess || novelHook.current.isError).toBe(true));
    expect(capturedUrl!.searchParams.get('contentType')).toBe('light_novel');
  });

  it('maps mobile short-forms: audio → audiobook', async () => {
    let capturedUrl: URL | null = null;
    server.use(
      http.get('https://srv/api/discover/detail', ({ request }) => {
        capturedUrl = new URL(request.url);
        return HttpResponse.json({});
      }),
    );

    const audioResult = makeResult({ contentType: 'audio', source: 'audnex', sourceId: 'ASIN123' });
    const { result: audioHook } = await renderHook(() => useDiscoverDetail(audioResult, true), { wrapper });
    await waitFor(() => expect(audioHook.current.isSuccess || audioHook.current.isError).toBe(true));
    expect(capturedUrl!.searchParams.get('contentType')).toBe('audiobook');
  });

  it('sends mdexId when sources.mangadex is present', async () => {
    let capturedUrl: URL | null = null;
    server.use(
      http.get('https://srv/api/discover/detail', ({ request }) => {
        capturedUrl = new URL(request.url);
        return HttpResponse.json({ totalChapters: 88, mangadexId: 'mdex-uuid' });
      }),
    );

    const result = makeResult({ sources: { mangadex: 'mdex-uuid' } });
    const { result: hookResult } = await renderHook(() => useDiscoverDetail(result, true), { wrapper });
    await waitFor(() => expect(hookResult.current.isSuccess).toBe(true));

    expect(capturedUrl!.searchParams.get('mdexId')).toBe('mdex-uuid');
    expect(hookResult.current.data?.totalChapters).toBe(88);
    expect(hookResult.current.data?.mangadexId).toBe('mdex-uuid');
  });

  it('does not fetch when enabled=false', async () => {
    const result = makeResult();
    const { result: hookResult } = await renderHook(() => useDiscoverDetail(result, false), { wrapper });
    // Query should remain in 'pending' (not triggered — isFetching false).
    expect(hookResult.current.isPending).toBe(true);
    expect(hookResult.current.isFetching).toBe(false);
  });

  it('does not fetch when result is null', async () => {
    const { result: hookResult } = await renderHook(() => useDiscoverDetail(null, true), { wrapper });
    expect(hookResult.current.isPending).toBe(true);
    expect(hookResult.current.isFetching).toBe(false);
  });

  it('returns empty object on server error (best-effort, never throws)', async () => {
    server.use(
      http.get('https://srv/api/discover/detail', () => {
        return HttpResponse.json({ error: 'not found' }, { status: 404 });
      }),
    );

    const result = makeResult();
    const { result: hookResult } = await renderHook(() => useDiscoverDetail(result, true), { wrapper });
    await waitFor(() => expect(hookResult.current.isSuccess).toBe(true));
    // The hook catches errors and returns {} rather than throwing.
    expect(hookResult.current.data).toEqual({});
  });
});
