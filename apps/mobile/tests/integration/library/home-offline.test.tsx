import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { useConnectivity } from '@/state/connectivityStore';
import { useToasts } from '@/state/toastStore';
import type { OfflineItem } from '@/features/reader/lib/useOfflineDownloads';

const mockNavigate = jest.fn();
const mockTabDispatch = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      navigate: mockNavigate,
      getParent: () => ({ navigate: mockNavigate, dispatch: mockTabDispatch }),
    }),
    useFocusEffect: (cb: () => void) => cb(),
  };
});

// The dashboard data + prefs; offline these are paused (undefined data).
const mockDash = jest.fn();
jest.mock('@/api/hooks/useDashboard', () => ({ useDashboard: () => mockDash() }));
jest.mock('@/api/hooks/useDashboardPrefs', () => ({
  useDashboardPrefs: () => ({ data: { enabled: {} }, refetch: jest.fn() }),
  useSetDashboardPrefs: () => ({ mutate: jest.fn(), isPending: false }),
}));
// Continue Reading rail data.
const mockCR = jest.fn();
jest.mock('@/api/hooks/useContinueReading', () => ({
  useContinueReading: () => ({ refetch: jest.fn(), ...mockCR() }),
}));
jest.mock('@/api/hooks/useResetReadingProgress', () => ({
  useResetReadingProgress: () => ({ mutate: jest.fn(), isPending: false }),
}));
// Offline content the rail + empty branch read.
const mockHomeItems = jest.fn();
jest.mock('@/features/system/offlineContent', () => {
  const actual = jest.requireActual('@/features/system/offlineContent');
  return { ...actual, useOfflineHomeItems: () => mockHomeItems() };
});

import { AuthProvider } from '@/auth/AuthContext';
import HomeDashboard from '@/screens/HomeDashboard';

function offItem(o: Partial<OfflineItem> = {}): OfflineItem {
  return {
    readableKey: 'page_file_42', readableKeys: ['page_file_42'], volumeCount: 2,
    title: 'Berserk', seriesName: 'Berserk', contentType: 'manga',
    coverUrl: 'file:///c.img', hue: 12, seriesId: 7, bytes: 2048, lastReadAt: 1000,
    downloadedAt: 1000, resolved: true, broken: false, volumes: [], ...o,
  };
}
function setOnline(v: boolean) {
  useConnectivity.setState({ deviceOnline: v, serverReachable: v });
}
function renderHome() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider><AuthProvider><HomeDashboard /></AuthProvider></ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockNavigate.mockClear();
  mockTabDispatch.mockClear();
  useToasts.setState({ toasts: [] });
  mockDash.mockReturnValue({ data: undefined, refetch: jest.fn(), isLoading: false });
  mockCR.mockReturnValue({ data: { items: [] } });
  mockHomeItems.mockReturnValue([]);
  setOnline(true);
});

it('offline: shows the Downloaded rail and hides the server widgets behind OfflineSection', async () => {
  setOnline(false);
  mockHomeItems.mockReturnValue([offItem({ readableKey: 'page_file_42', title: 'Berserk' })]);
  renderHome();
  await waitFor(() => expect(screen.getByTestId('downloaded-rail')).toBeTruthy());
  expect(screen.getByTestId('downloaded-card-page_file_42')).toBeTruthy();
  expect(screen.getByTestId('offline-section')).toBeTruthy();
  // The dashboard widgets' labels are absent (data undefined + gated).
  expect(screen.queryByText('Your reading · this week')).toBeNull();
  expect(screen.queryByText('By format · this week')).toBeNull();
});

it('offline: tapping a downloaded card opens the Reader with the right params', async () => {
  setOnline(false);
  mockHomeItems.mockReturnValue([offItem({ readableKey: 'page_file_42' })]);
  renderHome();
  await waitFor(() => expect(screen.getByTestId('downloaded-card-page_file_42')).toBeTruthy());
  fireEvent.press(screen.getByTestId('downloaded-card-page_file_42'));
  // openReaderInLibrary seeds LibraryHome beneath the Reader (rooted stack) so
  // dismissing the reader modal returns to the Library list.
  expect(mockTabDispatch).toHaveBeenCalled();
  const action = mockTabDispatch.mock.calls[0][0];
  expect(action.payload.name).toBe('Library');
  expect(action.payload.params.state.routes.map((r: { name: string }) => r.name)).toEqual([
    'LibraryHome',
    'Reader',
  ]);
  expect(action.payload.params.state.routes[1].params).toEqual({ fileId: '42' });
});

it('offline: Discover is gated → toast, no navigation', async () => {
  setOnline(false);
  mockHomeItems.mockReturnValue([offItem()]);
  renderHome();
  await waitFor(() => expect(screen.getByTestId('home-discover')).toBeTruthy());
  fireEvent.press(screen.getByTestId('home-discover'));
  expect(mockNavigate).not.toHaveBeenCalledWith('Discover');
  expect(useToasts.getState().toasts.at(-1)?.message).toBe('Unavailable offline');
});

it('offline + nothing downloaded + nothing in progress: shows the empty hint, no spinner', async () => {
  setOnline(false);
  mockHomeItems.mockReturnValue([]);
  mockCR.mockReturnValue({ data: { items: [] } });
  renderHome();
  await waitFor(() => expect(screen.getByText('Nothing downloaded yet')).toBeTruthy());
  expect(screen.queryByTestId('downloaded-rail')).toBeNull();
});

it('offline: gated icon buttons render visibly disabled (accessibilityState.disabled)', async () => {
  setOnline(false);
  mockHomeItems.mockReturnValue([offItem()]);
  renderHome();
  await waitFor(() => expect(screen.getByTestId('home-discover')).toBeTruthy());
  for (const id of ['home-customize', 'home-calendar', 'home-discover']) {
    expect(screen.getByTestId(id).props.accessibilityState?.disabled).toBe(true);
  }
});

it('online: gated icon buttons are not disabled', async () => {
  setOnline(true);
  renderHome();
  await waitFor(() => expect(screen.getByTestId('home-discover')).toBeTruthy());
  for (const id of ['home-customize', 'home-calendar', 'home-discover']) {
    expect(screen.getByTestId(id).props.accessibilityState?.disabled).toBe(false);
  }
});

it('offline: Continue Reading has cached data but no downloads → no misleading empty-state', async () => {
  setOnline(false);
  mockHomeItems.mockReturnValue([]); // nothing downloaded
  // CR query is paused offline → data undefined; the rail may still show cached
  // entries. The Home empty-state must NOT appear just because CR is paused.
  mockCR.mockReturnValue({ data: undefined });
  renderHome();
  await waitFor(() => expect(screen.getByTestId('home-discover')).toBeTruthy());
  expect(screen.queryByText('Nothing downloaded yet')).toBeNull();
});

it('online: renders the real widgets and no Downloaded rail (no regression)', async () => {
  setOnline(true);
  mockDash.mockReturnValue({
    data: {
      greetingName: 'Paul',
      personal: { current: { minutes: 30, units: 2, booksFinished: 1, streakDays: 3 } },
      goals: { goals: {} }, format: { byType: {}, totalMinutes: 0 },
      leaderboard: { time: [] }, memberCount: 1, releases: [], recent: [], server: null,
    },
    refetch: jest.fn(), isLoading: false,
  });
  renderHome();
  await waitFor(() => expect(screen.getByText('Your reading · this week')).toBeTruthy());
  expect(screen.queryByTestId('downloaded-rail')).toBeNull();
  expect(screen.queryByTestId('offline-section')).toBeNull();
});
