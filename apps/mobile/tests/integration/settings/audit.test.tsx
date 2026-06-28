import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Audit from '@/screens/settings/Audit';
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
it('renders audit events and filters', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <Audit />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('audit-row-1')).toBeTruthy());
  fireEvent.press(screen.getByTestId('audit-filter-logins'));
  await waitFor(() => expect(screen.getByTestId('audit-row-3')).toBeTruthy());
});
