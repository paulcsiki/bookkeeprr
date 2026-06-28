import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { useLibrary } from '@/api/hooks/useLibrary';
import { AuthProvider } from '@/auth/AuthContext';

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

it('useLibrary fetches and parses', async () => {
  (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      rows: [
        {
          id: 1,
          title: 'Vinland Saga',
          contentType: 'manga',
          coverUrl: null,
          monitored: true,
          volumes: 25,
          downloaded: 20,
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    }),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthProvider>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </AuthProvider>
  );
  const { result } = await renderHook(() => useLibrary({ page: 1, limit: 20 }), { wrapper });
  await waitFor(() => expect(result.current.data?.total).toBe(1));
});
