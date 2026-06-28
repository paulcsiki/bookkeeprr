import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { useConnectivity } from '@/state/connectivityStore';
import { useToasts } from '@/state/toastStore';
import type { OfflineSeriesRow } from '@/features/system/offlineContent';
import type { OfflineItem } from '@/features/reader/lib/useOfflineDownloads';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
    useRoute: () => ({ params: { seriesId: '7' } }),
  };
});

const mockSeries = jest.fn();
jest.mock('@/api/hooks', () => ({ useSeries: () => mockSeries() }));
jest.mock('@/api/hooks/useContinueReading', () => ({ useContinueReading: () => ({ data: { items: [] } }) }));

const mockLayout = jest.fn();
jest.mock('@/responsive/useLayout', () => ({ useLayout: () => mockLayout() }));

const mockLibSeries = jest.fn();
jest.mock('@/features/system/offlineContent', () => {
  const actual = jest.requireActual('@/features/system/offlineContent');
  return { ...actual, useOfflineLibrarySeries: () => mockLibSeries() };
});

// SeriesOverview calls useBookSeriesMemberMap to show the "Part of series"
// row. These offline tests focus on offline state display — mock the hook
// so it doesn't require a QueryClientProvider in the test wrapper.
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

import { AuthProvider } from '@/auth/AuthContext';
import SeriesOverview from '@/screens/library/SeriesOverview';

function offItem(o: Partial<OfflineItem> = {}): OfflineItem {
  return {
    readableKey: 'page_file_42', readableKeys: ['page_file_42'], volumeCount: 1,
    title: 'Berserk', seriesName: 'Berserk', contentType: 'manga', coverUrl: 'file:///c.img', hue: 12,
    bytes: 1024, lastReadAt: 1, downloadedAt: 1, resolved: true, broken: false, seriesId: 7, ...o,
  } as OfflineItem;
}
function row(o: Partial<OfflineSeriesRow> = {}): OfflineSeriesRow {
  return {
    readableKey: 'page_file_42', title: 'Berserk', coverUrl: 'file:///c.img',
    contentType: 'manga', hue: 12, volumeCount: 1, seriesId: 7,
    items: [offItem()], ...o,
  } as OfflineSeriesRow;
}
const phone = { isLandscape: false, isTablet: false, class: 'phone', numCols: 2 };
const tablet = { isLandscape: true, isTablet: true, class: 'tablet-landscape', numCols: 6 };
function setOnline(v: boolean) { useConnectivity.setState({ deviceOnline: v, serverReachable: v }); }
function renderOverview() {
  return render(<ThemeProvider><AuthProvider><SeriesOverview /></AuthProvider></ThemeProvider>);
}

beforeEach(() => {
  mockNavigate.mockClear();
  useToasts.setState({ toasts: [] });
  mockSeries.mockReturnValue({ isLoading: false, isError: true, data: undefined, refetch: jest.fn() });
  mockLibSeries.mockReturnValue([]);
  mockLayout.mockReturnValue(phone);
  setOnline(false);
});

it('offline + series error + a downloaded volume: shows offline state and opens the Reader', async () => {
  mockLibSeries.mockReturnValue([row()]);
  renderOverview();
  await waitFor(() => expect(screen.getByTestId('offline-section')).toBeTruthy());
  expect(screen.getByTestId('offline-vol-page_file_42')).toBeTruthy();
  fireEvent.press(screen.getByTestId('offline-vol-page_file_42'));
  expect(mockNavigate).toHaveBeenCalledWith('Reader', { fileId: '42' });
});

it('offline + series error + nothing downloaded: OfflineSection with no volumes, not the err EmptyState', async () => {
  mockLibSeries.mockReturnValue([]);
  renderOverview();
  await waitFor(() => expect(screen.getByTestId('offline-section')).toBeTruthy());
  expect(screen.queryByTestId('offline-vol-page_file_42')).toBeNull();
  expect(screen.queryByText('Try again')).toBeNull(); // the online err CTA is gone offline
});

it('offline tablet (SplitView): renders the offline state in the split', async () => {
  mockLayout.mockReturnValue(tablet);
  mockLibSeries.mockReturnValue([row()]);
  renderOverview();
  await waitFor(() => expect(screen.getByTestId('offline-section')).toBeTruthy());
  expect(screen.getByTestId('offline-vol-page_file_42')).toBeTruthy();
});

it('online + series error: keeps the real err EmptyState (Try again)', async () => {
  setOnline(true);
  renderOverview();
  await waitFor(() => expect(screen.getByText('Try again')).toBeTruthy());
  expect(screen.queryByTestId('offline-section')).toBeNull();
});
