import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import Settings from '@/screens/settings/SettingsHome';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/auth/AuthContext';
import { server } from '@/../tests/mocks/server';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 1180, height: 820 }),
}));
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
it('renders split layout on tablet landscape', async () => {
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
  await waitFor(() => expect(screen.getByTestId('settings-split')).toBeTruthy());
  expect(screen.getByTestId('settings-split-left')).toBeTruthy();
  expect(screen.getByTestId('settings-split-right')).toBeTruthy();
});

it('swaps the detail pane when a left-pane nav item is pressed (admin)', async () => {
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
  // The grouped left pane renders only once `me` resolves as admin (the Users
  // nav item is admin-gated). Wait for it, then press it.
  await waitFor(() => expect(screen.getByTestId('set-nav-users')).toBeTruthy());
  // Default detail is Appearance — the Users detail isn't mounted yet.
  expect(screen.queryByTestId('screen-users')).toBeNull();
  await fireEvent.press(screen.getByTestId('set-nav-users'));
  // Pressing the nav item swaps the right pane to the Users detail screen.
  await waitFor(() => expect(screen.getByTestId('screen-users')).toBeTruthy());
  // The Add-user action is admin-only — confirms the admin Users pane rendered.
  expect(screen.getByTestId('btn-add-user')).toBeTruthy();
});
