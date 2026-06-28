import { render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Library from '@/screens/library/LibraryHome';
import { ThemeProvider } from '@/theme/ThemeProvider';
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
it('renders library grid from MSW fixtures', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <Library />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
  // DS14 added useDownloads + useUpdateAvailable + summary queries; with the
  // extra concurrent fetches, default 1s waitFor occasionally times out before
  // the library query lands in the integration env. 5s passed locally but
  // CI (the GitLab runner on the Mac mini) still timed out at 5s — likely the
  // React Query scheduler is slower under containerised CI load. 15s is
  // generous but the assertion still trips fast on the happy path; the cost
  // is only paid on the actual flake.
  await waitFor(() => expect(screen.getByText('Vinland Saga')).toBeTruthy(), { timeout: 15_000 });
  expect(screen.getByText('Berserk')).toBeTruthy();
}, 20_000);
