import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { useSearchSeries } from '@/api/hooks/useSearchSeries';
import { useAddSeries } from '@/api/hooks/useAddSeries';
import { useInteractiveSearch } from '@/api/hooks/useInteractiveSearch';
import { useGrabRelease } from '@/api/hooks/useGrabRelease';
import { AuthProvider, useAuth } from '@/auth/AuthContext';

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

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <AuthProvider>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </AuthProvider>
  );
};

describe('M2 hooks (against MSW)', () => {
  it('useSearchSeries returns normalized results', async () => {
    const { result } = await renderHook(
      () => useSearchSeries({ query: 'vinland', contentType: 'manga' }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data?.results.length).toBeGreaterThan(0));
    expect(result.current.data!.results[0]!.title).toMatch(/vinland/i);
  });

  it('useSearchSeries is disabled when query is empty', async () => {
    const { result } = await renderHook(() => useSearchSeries({ query: '', contentType: 'manga' }), {
      wrapper,
    });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('useAddSeries mutate resolves', async () => {
    const { result } = await renderHook(() => ({ auth: useAuth(), add: useAddSeries() }), { wrapper });
    await waitFor(() => expect(result.current.auth.state.status).toBe('authenticated'));
    await result.current.add.mutateAsync({
      sourceId: 'anilist:1',
      contentType: 'manga',
      qualityProfileId: 1,
    });
  });

  it('useInteractiveSearch returns release rows', async () => {
    const { result } = await renderHook(() => useInteractiveSearch(1), { wrapper });
    await waitFor(() => expect(result.current.data?.releases.length).toBeGreaterThan(0));
  });

  it('useGrabRelease resolves with downloadId', async () => {
    const { result } = await renderHook(() => ({ auth: useAuth(), grab: useGrabRelease() }), { wrapper });
    await waitFor(() => expect(result.current.auth.state.status).toBe('authenticated'));
    const r = await result.current.grab.mutateAsync(9);
    expect(r.downloadId).toBeGreaterThan(0);
  });
});
