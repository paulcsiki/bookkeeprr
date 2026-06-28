import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SeriesOverview from '@/screens/library/SeriesOverview';
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
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ navigate: jest.fn(), goBack: mockGoBack }),
    useRoute: () => ({ params: { seriesId: '1' } }),
  };
});

beforeEach(() => mockGoBack.mockClear());

it('renders split layout on tablet landscape', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <SeriesOverview />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('series-split')).toBeTruthy());
  expect(screen.getByTestId('series-split-left')).toBeTruthy();
  expect(screen.getByTestId('series-split-right')).toBeTruthy();
});

it('has a back button in landscape that goes back to the library list', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <SeriesOverview />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('series-split')).toBeTruthy());
  const back = screen.getByTestId('btn-back-series');
  expect(back).toBeTruthy();
  fireEvent.press(back);
  expect(mockGoBack).toHaveBeenCalledTimes(1);
});

it('constrains the detail-pane hero with a left-aligned max-width on tablet', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <SeriesOverview />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
  const hero = await screen.findByTestId('series-hero');
  expect(hero).toBeTruthy();
  const style = Array.isArray(hero.props.style)
    ? Object.assign({}, ...hero.props.style)
    : hero.props.style;
  // Capped so the poster doesn't balloon to fill the pane; left-aligned.
  expect(style.maxWidth).toBe(340);
  expect(style.alignSelf).toBe('flex-start');
});

it('marks read / in-progress volumes in the volume list', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <SeriesOverview />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
  // Fixtures mark volume 1 finished and volume 2 in-progress. (The finished
  // volume is marked in both the volume list and the recent-covers strip, so
  // there can be more than one "Read" node.) Series 1 is manga → "Read".
  await waitFor(() => expect(screen.getAllByLabelText('Read').length).toBeGreaterThan(0));
  expect(screen.getAllByLabelText('In progress').length).toBeGreaterThan(0);
});
