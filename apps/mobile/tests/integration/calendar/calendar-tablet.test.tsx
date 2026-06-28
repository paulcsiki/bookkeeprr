import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CalendarMonth from '@/screens/calendar/CalendarMonth';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/auth/AuthContext';

// Tablet landscape (mirrors series-tablet.test.tsx).
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
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      navigate: mockNavigate,
      goBack: jest.fn(),
      getParent: () => ({ navigate: mockTabNavigate, dispatch: mockTabDispatch }),
    }),
  };
});

function currentMonthYmd(day: number): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-${String(day).padStart(2, '0')}`;
}

beforeEach(() => {
  mockNavigate.mockClear();
  mockTabNavigate.mockClear();
  mockTabDispatch.mockClear();
});

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <CalendarMonth />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

it('renders the split layout and shows a tapped day inline (no push)', async () => {
  renderScreen();
  await waitFor(() => expect(screen.getByTestId('calendar-split')).toBeTruthy(), {
    timeout: 15_000,
  });
  expect(screen.getByTestId('calendar-split-left')).toBeTruthy();
  expect(screen.getByTestId('calendar-split-right')).toBeTruthy();

  const day15 = currentMonthYmd(15);
  await waitFor(() => expect(screen.getByTestId(`cal-day-${day15}`)).toBeTruthy(), {
    timeout: 15_000,
  });
  fireEvent.press(screen.getByTestId(`cal-day-${day15}`));
  // Selection is inline — the day detail fills the right pane, nothing pushes.
  expect(mockNavigate).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByTestId('cal-release-9101')).toBeTruthy(), {
    timeout: 15_000,
  });
  expect(screen.getByTestId('cal-release-9102')).toBeTruthy();

  fireEvent.press(screen.getByTestId('cal-release-9102'));
  // openSeriesInLibrary seeds the Library stack with LibraryHome beneath the detail.
  expect(mockTabDispatch).toHaveBeenCalled();
  const action = mockTabDispatch.mock.calls[0][0];
  expect(action.payload.name).toBe('Library');
  expect(action.payload.params.state.routes.map((r: { name: string }) => r.name)).toEqual([
    'LibraryHome',
    'SeriesOverview',
  ]);
  expect(action.payload.params.state.routes[1].params).toEqual({ seriesId: '4' });
}, 20_000);
