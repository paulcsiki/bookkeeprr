import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AddSeries from '@/screens/library/AddSeries';
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
it('searches and shows result rows', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <AddSeries />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
  await fireEvent.changeText(screen.getByTestId('input-add-search'), 'vinland');
  await waitFor(() => expect(screen.getByText('Vinland Saga')).toBeTruthy());
});
