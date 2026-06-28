import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Activity from '@/screens/Activity';
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

it('renders downloading rows from MSW fixtures', async () => {
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
  await waitFor(() => expect(screen.getByTestId('queue-row-1')).toBeTruthy());
});

it('switches to history tab and shows imported rows', async () => {
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
  await waitFor(() => expect(screen.getByTestId('queue-row-1')).toBeTruthy());
  await fireEvent.press(screen.getByTestId('tab-history'));
  await waitFor(() => expect(screen.getByTestId('history-row-5')).toBeTruthy());
});

it('switches to blocked tab and shows failed rows', async () => {
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
  await waitFor(() => expect(screen.getByTestId('queue-row-1')).toBeTruthy());
  await fireEvent.press(screen.getByTestId('tab-blocked'));
  await waitFor(() => expect(screen.getByTestId('history-row-6')).toBeTruthy());
});
