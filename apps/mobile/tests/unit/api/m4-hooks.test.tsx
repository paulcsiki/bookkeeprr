import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { useChangelogSeen } from '@/api/hooks/useChangelogSeen';
import { useUpdateAvailable } from '@/api/hooks/useUpdateAvailable';
import { useAuth, AuthProvider } from '@/auth/AuthContext';

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

it('useChangelogSeen returns lastSeen and markSeen', async () => {
  const useBoth = () => {
    const auth = useAuth();
    const cs = useChangelogSeen();
    return { auth, cs };
  };
  const { result } = await renderHook(useBoth, { wrapper });
  await waitFor(() => expect(result.current.auth.state.status).toBe('authenticated'));
  // After hydration the server returns null (MSW default)
  await waitFor(() => expect(result.current.cs.isLoading).toBe(false));
  expect(result.current.cs.lastSeen).toBeNull();
  // markSeen fires a POST and caches the version
  await result.current.cs.mutateAsync('0.1.0');
});

it('useUpdateAvailable returns false when versions match', async () => {
  const { result } = await renderHook(() => useUpdateAvailable(), { wrapper });
  await waitFor(() => expect(result.current.serverCurrent).toBe('0.1.0'));
  expect(result.current.available).toBe(false);
});
