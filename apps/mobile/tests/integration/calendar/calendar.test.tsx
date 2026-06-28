import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import CalendarMonth from '@/screens/calendar/CalendarMonth';
import CalendarDay from '@/screens/calendar/CalendarDay';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/auth/AuthContext';
import { server } from '../../mocks/server';
import { fixtureCalendarEntries } from '../../mocks/fixtures';

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

const mockNavigate = jest.fn();
const mockTabNavigate = jest.fn();
const mockTabDispatch = jest.fn();
let mockRouteDate = '';
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      navigate: mockNavigate,
      goBack: jest.fn(),
      getParent: () => ({ navigate: mockTabNavigate, dispatch: mockTabDispatch }),
    }),
    useRoute: () => ({ params: { date: mockRouteDate } }),
  };
});

/** YYYY-MM-DD of `day` in the current UTC month — matches the fixture pinning. */
function currentMonthYmd(day: number): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-${String(day).padStart(2, '0')}`;
}

function renderScreen(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>{node}</QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  mockNavigate.mockClear();
  mockTabNavigate.mockClear();
  mockTabDispatch.mockClear();
  mockRouteDate = '';
});

it('renders the month grid with seeded releases on the right days', async () => {
  renderScreen(<CalendarMonth />);
  const day15 = currentMonthYmd(15);
  await waitFor(() => expect(screen.getByTestId(`cal-day-${day15}`)).toBeTruthy(), {
    timeout: 15_000,
  });
  // Fixtures pin 1 release on the 3rd, 2 on the 15th, 1 on the 22nd — the
  // cells' accessibility labels carry the per-day counts.
  expect(screen.getByLabelText(`1 release on ${currentMonthYmd(3)}`)).toBeTruthy();
  expect(screen.getByLabelText(`2 releases on ${day15}`)).toBeTruthy();
  expect(screen.getByLabelText(`1 release on ${currentMonthYmd(22)}`)).toBeTruthy();
  expect(screen.getByLabelText(`0 releases on ${currentMonthYmd(14)}`)).toBeTruthy();
}, 20_000);

it('pushes the day screen when a day with releases is tapped (phone)', async () => {
  renderScreen(<CalendarMonth />);
  const day15 = currentMonthYmd(15);
  await waitFor(() => expect(screen.getByTestId(`cal-day-${day15}`)).toBeTruthy(), {
    timeout: 15_000,
  });
  fireEvent.press(screen.getByTestId(`cal-day-${day15}`));
  expect(mockNavigate).toHaveBeenCalledWith('CalendarDay', { date: day15 });
}, 20_000);

it('shows the empty state when navigating to a month without releases', async () => {
  renderScreen(<CalendarMonth />);
  await waitFor(() => expect(screen.getByTestId(`cal-day-${currentMonthYmd(15)}`)).toBeTruthy(), {
    timeout: 15_000,
  });
  fireEvent.press(screen.getByTestId('cal-next'));
  // The fixture handler filters by [from, to), so next month comes back empty.
  await waitFor(() => expect(screen.getByText('Nothing scheduled')).toBeTruthy(), {
    timeout: 15_000,
  });
}, 20_000);

it("lists the day's releases and opens the series in the Library stack on tap", async () => {
  mockRouteDate = currentMonthYmd(15);
  renderScreen(<CalendarDay />);
  await waitFor(() => expect(screen.getByTestId('cal-release-9101')).toBeTruthy(), {
    timeout: 15_000,
  });
  expect(screen.getByTestId('cal-release-9102')).toBeTruthy();
  expect(screen.getByText(/Spice and Wolf/)).toBeTruthy();

  fireEvent.press(screen.getByTestId('cal-release-9101'));
  // openSeriesInLibrary dispatches a navigate to the Library tab whose nested
  // stack is seeded with LibraryHome beneath SeriesOverview (rooted stack).
  expect(mockTabDispatch).toHaveBeenCalled();
  const action = mockTabDispatch.mock.calls[0][0];
  expect(action.payload.name).toBe('Library');
  expect(action.payload.params.state.routes.map((r: { name: string }) => r.name)).toEqual([
    'LibraryHome',
    'SeriesOverview',
  ]);
  expect(action.payload.params.state.routes[1].params).toEqual({ seriesId: '3' });
}, 20_000);

it('shows the error EmptyState when the calendar fails to load and retries on "Try again"', async () => {
  let hits = 0;
  server.use(
    http.get('https://srv/api/calendar', () => {
      hits += 1;
      if (hits === 1) return new HttpResponse('boom', { status: 500 });
      return HttpResponse.json({ entries: fixtureCalendarEntries() });
    }),
  );

  renderScreen(<CalendarMonth />);
  await waitFor(() => expect(screen.getByText('Couldn’t load the calendar')).toBeTruthy(), {
    timeout: 15_000,
  });

  fireEvent.press(screen.getByText('Try again'));
  await waitFor(
    () => expect(screen.getByTestId(`cal-day-${currentMonthYmd(15)}`)).toBeTruthy(),
    { timeout: 15_000 },
  );
  expect(hits).toBeGreaterThanOrEqual(2);
}, 20_000);
