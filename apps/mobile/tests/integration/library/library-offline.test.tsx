import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/auth/AuthContext';
import { useConnectivity } from '@/state/connectivityStore';
import { useToasts } from '@/state/toastStore';
import type { OfflineSeriesRow } from '@/features/system/offlineContent';

jest.mock('@/auth/token-store', () => ({
  tokenStore: {
    load: jest.fn().mockResolvedValue(null),
    save: jest.fn(),
    clear: jest.fn(),
  },
}));

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ navigate: mockNavigate, getParent: () => ({ navigate: jest.fn() }) }),
  };
});

const mockLibrary = jest.fn();
jest.mock('@/api/hooks', () => ({
  useLibrary: () => mockLibrary(),
  useLibrarySummary: () => ({ data: undefined }),
  useUpdateAvailable: () => ({ available: false, serverCurrent: null, mobile: null }),
  useDownloads: () => ({ data: { downloads: [] } }),
  useLibraryGroups: () => ({ data: { groups: [] } }),
}));

const mockLibSeries = jest.fn();
jest.mock('@/features/system/offlineContent', () => {
  const actual = jest.requireActual('@/features/system/offlineContent');
  return { ...actual, useOfflineLibrarySeries: () => mockLibSeries() };
});

// LibraryHome calls useBookSeriesMemberMap to collapse book-series members into
// a single card. These offline tests focus on offline state display — mock the
// hook so it doesn't require a QueryClientProvider in the test wrapper.
jest.mock('@/api/hooks/useBookSeries', () => ({
  useBookSeriesMemberMap: () => ({
    memberMap: new Map<number, number>(),
    isLoading: false,
    bookSeriesList: [],
  }),
  useBookSeriesList: jest.fn(),
  useBookSeries: jest.fn(),
  useAssignToBookSeries: jest.fn(),
  useRemoveFromBookSeries: jest.fn(),
  useRefreshBookSeries: jest.fn(),
}));

import Library from '@/screens/library/LibraryHome';

function row(o: Partial<OfflineSeriesRow> = {}): OfflineSeriesRow {
  return {
    readableKey: 'page_file_42',
    title: 'Berserk',
    coverUrl: 'file:///c.img',
    contentType: 'manga',
    hue: 12,
    volumeCount: 3,
    seriesId: 7,
    items: [],
    ...o,
  };
}
function setOnline(v: boolean) {
  useConnectivity.setState({ deviceOnline: v, serverReachable: v });
}
function renderLib() {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <Library />
      </AuthProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  mockNavigate.mockClear();
  useToasts.setState({ toasts: [] });
  mockLibrary.mockReturnValue({
    isLoading: false,
    isError: false,
    isFetching: false,
    data: undefined,
    refetch: jest.fn(),
  });
  mockLibSeries.mockReturnValue([]);
  setOnline(true);
});

it('offline + library error + no cache: no NetworkErrorScreen; downloaded grid renders', async () => {
  setOnline(false);
  mockLibrary.mockReturnValue({
    isLoading: false,
    isError: true,
    isFetching: false,
    data: undefined,
    refetch: jest.fn(),
  });
  mockLibSeries.mockReturnValue([row({ readableKey: 'page_file_42', title: 'Berserk' })]);
  renderLib();
  await waitFor(() => expect(screen.getByTestId('offline-series-page_file_42')).toBeTruthy());
  expect(screen.queryByTestId('btn-net-retry')).toBeNull();
  expect(screen.getByText('Berserk')).toBeTruthy();
});

it('online + library error + no cache: NetworkErrorScreen still shows', async () => {
  setOnline(true);
  mockLibrary.mockReturnValue({
    isLoading: false,
    isError: true,
    isFetching: false,
    data: undefined,
    refetch: jest.fn(),
  });
  renderLib();
  await waitFor(() => expect(screen.getByTestId('btn-net-retry')).toBeTruthy());
});

it('offline: tapping a downloaded series tile navigates to SeriesOverview', async () => {
  setOnline(false);
  mockLibrary.mockReturnValue({
    isLoading: false,
    isError: true,
    isFetching: false,
    data: undefined,
    refetch: jest.fn(),
  });
  mockLibSeries.mockReturnValue([row({ readableKey: 'page_file_42', seriesId: 7 })]);
  renderLib();
  await waitFor(() => expect(screen.getByTestId('offline-series-page_file_42')).toBeTruthy());
  fireEvent.press(screen.getByTestId('offline-series-page_file_42'));
  expect(mockNavigate).toHaveBeenCalledWith('SeriesOverview', { seriesId: '7' });
});

it('offline + no downloads: empty state, not a spinner', async () => {
  setOnline(false);
  mockLibrary.mockReturnValue({
    isLoading: true,
    isError: false,
    isFetching: false,
    data: undefined,
    refetch: jest.fn(),
  });
  mockLibSeries.mockReturnValue([]);
  renderLib();
  await waitFor(() => expect(screen.getByText('No downloaded series')).toBeTruthy());
  expect(screen.queryByTestId('btn-net-retry')).toBeNull();
});

it('offline: Filter is gated → toast', async () => {
  setOnline(false);
  mockLibrary.mockReturnValue({
    isLoading: false,
    isError: true,
    isFetching: false,
    data: undefined,
    refetch: jest.fn(),
  });
  mockLibSeries.mockReturnValue([row()]);
  renderLib();
  await waitFor(() => expect(screen.getByTestId('btn-filter')).toBeTruthy());
  fireEvent.press(screen.getByTestId('btn-filter'));
  expect(mockNavigate).not.toHaveBeenCalledWith('FilterSheet');
  expect(useToasts.getState().toasts.at(-1)?.message).toBe('Unavailable offline');
});
