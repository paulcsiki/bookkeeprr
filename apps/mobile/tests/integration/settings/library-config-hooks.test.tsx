import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/auth/AuthContext';
import { useStorage } from '@/api/hooks/useStorage';
import { useStartScan } from '@/api/hooks/useStartScan';
import { server } from '../../mocks/server';
import { http, HttpResponse } from 'msw';

jest.mock('@/auth/token-store', () => ({
  tokenStore: {
    load: jest.fn().mockResolvedValue({
      serverUrl: 'https://srv',
      token: 't',
      refreshToken: 'r',
      expiresAt: '2999-01-01T00:00:00Z',
      certFingerprint: null,
    }),
    save: jest.fn(),
    clear: jest.fn(),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return (
    <AuthProvider>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </AuthProvider>
  );
}

const defaultStorage = {
  contentTypePaths: {
    manga: { libraryRoot: '/media/manga', qbtCategory: 'manga' },
    comic: { libraryRoot: '', qbtCategory: '' },
    light_novel: { libraryRoot: '', qbtCategory: '' },
    ebook: { libraryRoot: '', qbtCategory: '' },
    audiobook: { libraryRoot: '', qbtCategory: '' },
  },
  torrentCleanup: { mode: 'never', deleteFiles: false },
  imageCache: { enabled: false, dir: '' },
};

describe('useStorage', () => {
  it('GETs storage settings from /api/settings/storage', async () => {
    server.use(
      http.get('https://srv/api/settings/storage', () =>
        HttpResponse.json(defaultStorage),
      ),
    );

    const { result } = await renderHook(() => useStorage(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.contentTypePaths.manga).toEqual({
      libraryRoot: '/media/manga',
      qbtCategory: 'manga',
    });
    expect(result.current.data?.torrentCleanup.mode).toBe('never');
    expect(result.current.data?.imageCache.enabled).toBe(false);
  });
});

describe('useStartScan', () => {
  it('returns jobId on 202 success', async () => {
    server.use(
      http.post('https://srv/api/scan', async () =>
        HttpResponse.json({ jobId: 7 }, { status: 202 }),
      ),
    );

    const { result } = await renderHook(() => useStartScan(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });

    const out = await result.current.mutateAsync({ rootPath: '/media' });
    expect(out).toEqual({ jobId: 7 });
  });

  it('returns { alreadyRunning: true } on 409 instead of throwing', async () => {
    server.use(
      http.post('https://srv/api/scan', async () =>
        HttpResponse.json(
          { error: 'a library_scan is already in progress', existingJobId: 3 },
          { status: 409 },
        ),
      ),
    );

    const { result } = await renderHook(() => useStartScan(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });

    const out = await result.current.mutateAsync({ rootPath: '/media' });
    expect(out).toEqual({ alreadyRunning: true });
  });
});
