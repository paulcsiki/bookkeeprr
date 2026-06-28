import { render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Users from '@/screens/settings/Users';
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
it('renders users from MSW', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <Users />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('user-row-1')).toBeTruthy());
  expect(screen.getByText('paul')).toBeTruthy();
  expect(screen.getByText('toni')).toBeTruthy();
});
