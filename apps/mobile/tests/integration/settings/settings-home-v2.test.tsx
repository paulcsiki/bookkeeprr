import { render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Settings from '@/screens/settings/SettingsHome';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/auth/AuthContext';
import { server } from '@/../tests/mocks/server';
import { http, HttpResponse } from 'msw';

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
it('renders grouped sections + profile card with admin rows', async () => {
  server.use(
    http.get('https://srv/api/mobile/me', () =>
      HttpResponse.json({
        id: 1,
        username: 'admin',
        email: null,
        displayName: null,
        role: 'admin',
      }),
    ),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <Settings />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.getByText('LIBRARY')).toBeTruthy());
  expect(screen.getByText('GENERAL')).toBeTruthy();
  expect(screen.getByText('SOURCES')).toBeTruthy();
  expect(screen.getByText('ACCESS')).toBeTruthy();
  expect(screen.getByText('SYSTEM')).toBeTruthy();
  expect(screen.getByText('APP')).toBeTruthy();
  expect(screen.getByTestId('row-integrations')).toBeTruthy();
  expect(screen.getByTestId('row-users')).toBeTruthy();
  expect(screen.getByTestId('row-auth')).toBeTruthy();
  expect(screen.getByTestId('row-audit')).toBeTruthy();
  // Logs is a native admin-gated row in the System group.
  expect(screen.getByTestId('row-logs')).toBeTruthy();
  // Cloud Connection is gated off until the cloud service ships
  // (CLOUD_FEATURES_ENABLED=false), so its row must NOT render.
  expect(screen.queryByTestId('row-cloud')).toBeNull();
});
