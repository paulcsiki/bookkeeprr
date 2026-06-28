import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import Library from '@/screens/library/LibraryHome';
import SeriesOverview from '@/screens/library/SeriesOverview';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/auth/AuthContext';
import { useLibraryFilter } from '@/state/libraryFilterStore';
import { server } from '../../mocks/server';
import { fixtureSeries } from '../../mocks/fixtures';

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

// The global setup mock returns empty route params; SeriesOverview needs a
// seriesId, so override per-suite (same idiom as series-cta-labels.test.tsx).
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
    useRoute: () => ({ params: { seriesId: '1' } }),
  };
});

const BASE = 'https://srv';

const GROUPS = [
  { id: 1, name: 'Shonen', parentId: null, path: 'Shonen', seriesCount: 0, subgroupCount: 0 },
];

beforeEach(() => {
  useLibraryFilter.getState().reset();
  server.use(
    http.get(`${BASE}/api/library/groups`, () => HttpResponse.json({ groups: GROUPS })),
    http.get(`${BASE}/api/series`, () =>
      HttpResponse.json({ rows: fixtureSeries, total: fixtureSeries.length, page: 1, limit: 50 }),
    ),
  );
});

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

it('phone long-press on a grid card opens the move sheet and PATCHes the move', async () => {
  let received: unknown = null;
  server.use(
    http.patch(`${BASE}/api/series/:id`, async ({ request, params }) => {
      received = { id: params.id, body: await request.json() };
      return HttpResponse.json({ ok: true });
    }),
  );
  wrap(<Library />);
  const first = fixtureSeries[0]!;
  await waitFor(() => expect(screen.getByTestId(`grid-card-${first.id}`)).toBeTruthy(), {
    timeout: 15_000,
  });
  expect(screen.queryByTestId('move-sheet')).toBeNull();

  await fireEvent(screen.getByTestId(`grid-card-${first.id}`), 'longPress');
  await waitFor(() => expect(screen.getByTestId('move-sheet')).toBeTruthy());
  expect(
    screen.getByText(`${first.title} · CURRENTLY IN NO GROUP`.toUpperCase()),
  ).toBeTruthy();

  await waitFor(() => expect(screen.getByTestId('move-row-1')).toBeTruthy());
  await fireEvent.press(screen.getByTestId('move-row-1'));
  await fireEvent.press(screen.getByTestId('move-confirm'));

  await waitFor(() =>
    expect(received).toEqual({ id: String(first.id), body: { groupId: 1 } }),
  );
  // Success closes the sheet (state-driven unmount in LibraryHome).
  await waitFor(() => expect(screen.queryByTestId('move-sheet')).toBeNull());
}, 30_000);

it('series detail renders the Group row and opens the same sheet', async () => {
  wrap(<SeriesOverview />); // global nav mock routes to seriesId '1'
  await waitFor(() => expect(screen.getByTestId('series-group-row')).toBeTruthy(), {
    timeout: 15_000,
  });
  // Fixture detail 1 is ungrouped → root label.
  expect(screen.getByText('Library root')).toBeTruthy();
  expect(screen.queryByTestId('move-sheet')).toBeNull();

  await fireEvent.press(screen.getByTestId('series-group-row'));
  await waitFor(() => expect(screen.getByTestId('move-sheet')).toBeTruthy());
  expect(screen.getByTestId('move-row-root')).toBeTruthy();
  // Unchanged selection (already at root) → confirm disabled.
  expect(screen.getByTestId('move-confirm')).toBeDisabled();
}, 30_000);
