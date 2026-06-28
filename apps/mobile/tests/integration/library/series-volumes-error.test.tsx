import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import SeriesVolumes from '@/screens/library/SeriesVolumes';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/auth/AuthContext';
import { server } from '../../mocks/server';

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

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
    useRoute: () => ({ params: { seriesId: '1' } }),
  };
});

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <SeriesVolumes />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

it('shows the error EmptyState when the series fails to load and retries on "Try again"', async () => {
  let hits = 0;
  server.use(
    http.get('https://srv/api/series/:id', () => {
      hits += 1;
      return new HttpResponse('boom', { status: 500 });
    }),
  );

  await renderScreen();

  await waitFor(() => expect(screen.getByTestId('screen-volumes-error')).toBeTruthy());
  expect(screen.getByText('Couldn’t load this title')).toBeTruthy();
  expect(
    screen.getByText('We couldn’t reach the server. Check your connection and try again.'),
  ).toBeTruthy();

  await fireEvent.press(screen.getByText('Try again'));
  await waitFor(() => expect(hits).toBeGreaterThanOrEqual(2));
});
