import { render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NavigationContainer } from '@react-navigation/native';
import { SettingsHomeContent } from '@/features/settings/SettingsHomeContent';
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
      expiresAt: '2999-01-01T00:00:00Z',
      certFingerprint: null,
    }),
    save: jest.fn(),
    clear: jest.fn(),
  },
}));

it('hides admin-only rows and shows non-admin rows for a standard user', async () => {
  server.use(
    http.get('https://srv/api/mobile/me', () =>
      HttpResponse.json({
        id: 2,
        username: 'reader',
        email: null,
        displayName: null,
        role: 'user',
      }),
    ),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <NavigationContainer>
            <SettingsHomeContent />
          </NavigationContainer>
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
  // Wait for the me query to resolve and the menu to render
  await waitFor(() => expect(screen.getByText('Appearance')).toBeTruthy());

  // Admin-only rows must be absent
  expect(screen.queryByText('Users')).toBeNull();
  expect(screen.queryByText('Authentication')).toBeNull();
  expect(screen.queryByText('API Access')).toBeNull();
  expect(screen.queryByText('Audit Log')).toBeNull();
  expect(screen.queryByText('Logs')).toBeNull();
  expect(screen.queryByText('Cloud Connection')).toBeNull();

  // Sources group admin-only rows must also be absent for non-admin
  expect(screen.queryByText('Search Providers')).toBeNull();
  expect(screen.queryByText('Metadata')).toBeNull();
  expect(screen.queryByText('Google Books')).toBeNull();
  expect(screen.queryByText('MyAnimeList')).toBeNull();
  expect(screen.queryByText('New York Times')).toBeNull();
  expect(screen.queryByText('Download Client')).toBeNull();
  expect(screen.queryByText('FlareSolverr')).toBeNull();

  // Library group admin-only rows must also be absent for non-admin
  expect(screen.queryByText('Library Scan')).toBeNull();
  expect(screen.queryByText('Storage')).toBeNull();
  expect(screen.queryByText('Library Sync')).toBeNull();
  expect(screen.queryByText('Discover')).toBeNull();

  // A non-admin-visible item is present
  expect(screen.getByText('Appearance')).toBeTruthy();
});

it('renders the grouped menu with webapp groups for an admin', async () => {
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
          <NavigationContainer>
            <SettingsHomeContent />
          </NavigationContainer>
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.getByText('ACCESS')).toBeTruthy());
  expect(screen.getByText('Users')).toBeTruthy();
  expect(screen.getByText('Indexers')).toBeTruthy(); // a 'soon' item still appears

  // The General group's five native, admin-gated rows are visible to an admin.
  expect(screen.getByText('Updates')).toBeTruthy();
  expect(screen.getByText('Naming')).toBeTruthy();
  expect(screen.getByText('Auto-Grab')).toBeTruthy();
  expect(screen.getByText('Matcher')).toBeTruthy();
  expect(screen.getByText('Housekeeping')).toBeTruthy();

  // The Sources group's native, admin-gated rows are visible to an admin.
  expect(screen.getByText('Search Providers')).toBeTruthy();
  expect(screen.getByText('Metadata')).toBeTruthy();
  expect(screen.getByText('Google Books')).toBeTruthy();
  expect(screen.getByText('MyAnimeList')).toBeTruthy();
  expect(screen.getByText('New York Times')).toBeTruthy();
  // Download client (qBittorrent) and FlareSolverr are now native + admin-gated.
  expect(screen.getByText('Download Client')).toBeTruthy();
  expect(screen.getByText('FlareSolverr')).toBeTruthy();

  // The Library group's native, admin-gated rows are visible to an admin.
  expect(screen.getByText('Library Scan')).toBeTruthy();
  expect(screen.getByText('Storage')).toBeTruthy();
  expect(screen.getByText('Library Sync')).toBeTruthy();
  expect(screen.getByText('Discover')).toBeTruthy();
});
