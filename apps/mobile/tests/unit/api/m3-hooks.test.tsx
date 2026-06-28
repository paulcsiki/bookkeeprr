import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { useDownloads } from '@/api/hooks/useDownloads';
import { useAuditEvents } from '@/api/hooks/useAuditEvents';
import { useUsers } from '@/api/hooks/useUsers';
import { useAuthConfig } from '@/api/hooks/useAuthConfig';
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

// waitFor's default 1s timeout flakes under CI load — the AuthProvider's
// async tokenStore.load() resolves before the QueryClient kicks off the
// fetch, but on busy GitLab runners the combined startup + fetch can
// take a hair over 1s. Bump every probe to 5s.
const WAIT_OPTS = { timeout: 5000 } as const;

it('useDownloads returns rows', async () => {
  const { result } = await renderHook(() => useDownloads(), { wrapper });
  await waitFor(
    () => expect(result.current.data?.downloads.length).toBeGreaterThan(0),
    WAIT_OPTS,
  );
});

it('useAuditEvents returns rows + total', async () => {
  const { result } = await renderHook(() => useAuditEvents(), { wrapper });
  await waitFor(() => expect(result.current.data?.total).toBeGreaterThan(0), WAIT_OPTS);
});

it('useUsers returns users', async () => {
  const { result } = await renderHook(() => useUsers(), { wrapper });
  await waitFor(
    () => expect(result.current.data?.users.length).toBeGreaterThan(0),
    WAIT_OPTS,
  );
});

it('useAuthConfig returns modes', async () => {
  const { result } = await renderHook(() => useAuthConfig(), { wrapper });
  await waitFor(() => expect(result.current.data?.modes.length).toBe(3), WAIT_OPTS);
});
