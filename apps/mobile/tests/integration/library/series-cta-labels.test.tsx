import { render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import SeriesOverview from '@/screens/library/SeriesOverview';
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

let mockRouteSeriesId = '1';
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
    useRoute: () => ({ params: { seriesId: mockRouteSeriesId } }),
  };
});

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <SeriesOverview />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

/** Stub the continue-reading endpoint with the given items. */
function progressHandler(items: unknown[]) {
  server.use(http.get('https://srv/api/reader/progress', () => HttpResponse.json({ items })));
}

beforeEach(() => {
  mockRouteSeriesId = '1';
});

it('says "Listen now" for an audiobook series with no progress', async () => {
  // Series 6 (Project Hail Mary) is contentType audio with 1 owned volume.
  mockRouteSeriesId = '6';
  progressHandler([]);
  await renderScreen();

  await waitFor(() => expect(screen.getByTestId('btn-primary-action')).toBeTruthy());
  expect(screen.getByText('Listen now')).toBeTruthy();
});

it('says "Continue listening" for an audiobook series with in-progress audio', async () => {
  mockRouteSeriesId = '6';
  progressHandler([
    {
      id: 1,
      readableKey: 'audio:vol:1',
      seriesId: 6,
      volumeId: 1,
      libraryFileId: null,
      contentType: 'audiobook',
      position: 0.5,
      locatorJson: '{"sec":120}',
      finished: false,
      updatedAt: '2026-06-01T00:00:00Z',
      title: 'Project Hail Mary',
      coverUrl: null,
    },
  ]);
  await renderScreen();

  await waitFor(() => expect(screen.getByText('Continue listening')).toBeTruthy());
});

it('says "Read now" for a manga series with no progress', async () => {
  // Series 1 (Vinland Saga) is manga with owned volumes.
  mockRouteSeriesId = '1';
  progressHandler([]);
  await renderScreen();

  await waitFor(() => expect(screen.getByTestId('btn-primary-action')).toBeTruthy());
  expect(screen.getByText('Read now')).toBeTruthy();
});
