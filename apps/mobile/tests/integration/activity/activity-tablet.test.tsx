import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Activity from '@/screens/Activity';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/auth/AuthContext';

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

it('renders aggregate split layout on tablet landscape', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <Activity />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('activity-split')).toBeTruthy());
  expect(screen.getByTestId('activity-split-left')).toBeTruthy();
  expect(screen.getByTestId('activity-split-right')).toBeTruthy();
});

it('exposes a Blocked segment in the tablet right pane', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <Activity />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
  // Both History + Blocked toggles are present so blocked items are reachable
  // on tablet (where there is no phone-style tab bar).
  await waitFor(() => expect(screen.getByTestId('tablet-seg-history')).toBeTruthy());
  expect(screen.getByTestId('tablet-seg-blocked')).toBeTruthy();
  // Switching to Blocked surfaces the blocked section — the fixtures include one
  // failed (blocked) download (id 6, "Berserk"), so its row appears in the right
  // pane. Re-query the segment at press time: the right pane re-renders as the
  // downloads query resolves, which would stale a node captured earlier (and the
  // press would silently no-op under RNTL v14's async render).
  await fireEvent.press(screen.getByTestId('tablet-seg-blocked'));
  await waitFor(() => expect(screen.getByTestId('history-row-6')).toBeTruthy());
});
