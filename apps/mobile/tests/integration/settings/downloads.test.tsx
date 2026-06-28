import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/auth/AuthContext';
import { NavigationContainer } from '@react-navigation/native';
import Downloads from '@/screens/settings/Downloads';
import { useConnectivity } from '@/state/connectivityStore';
import { useToasts } from '@/state/toastStore';
import { useReaderDownloads } from '@/state/readerDownloadsStore';
import type { OfflineItem } from '@/features/reader/lib/useOfflineDownloads';

// Stable token so the screen's auth-dependent children find an AuthProvider.
jest.mock('@/auth/token-store', () => ({
  tokenStore: {
    load: jest.fn().mockResolvedValue({
      serverUrl: 'https://srv',
      token: 't',
      refreshToken: 'r',
      expiresAt: '2099-01-01T00:00:00Z',
      certFingerprint: null,
    }),
    save: jest.fn(),
    clear: jest.fn(),
  },
}));

// ── Mockable Downloads data ────────────────────────────────────────────────
// The screen's on-mount data comes ONLY from useOfflineDownloads (a disk scan,
// no network) — mock it directly so no real request fires (SP1 reachability
// trap). `useSeries` is mocked so "download rest of series" can enumerate
// volumes; `downloadReadable` is mocked so we assert enqueue without touching
// the network or the filesystem.
const mockRemoveOne = jest.fn();
const mockRemoveMany = jest.fn();
let mockItems: OfflineItem[] = [];

jest.mock('@/features/reader/lib/useOfflineDownloads', () => ({
  useOfflineDownloads: () => ({
    items: mockItems,
    totalBytes: mockItems.reduce((s: number, it: OfflineItem) => s + it.bytes, 0),
    byType: { manga: 0, comic: 0, novel: 0, ebook: 0, audio: 0 },
    isLoading: false,
    refetch: jest.fn(),
    removeOne: mockRemoveOne,
    removeMany: mockRemoveMany,
  }),
}));
jest.mock('@/features/reader/lib/offline-settings', () => ({
  useOfflineSettings: () => ({
    settings: { autoDownloadNext: true, wifiOnly: true },
    setAutoDownloadNext: jest.fn(),
    setWifiOnly: jest.fn(),
  }),
}));

let mockSeriesData: { volumesList: unknown[] } | undefined;
jest.mock('@/api/hooks/useSeries', () => ({
  useSeries: () => ({ data: mockSeriesData }),
}));

const mockDownloadReadable = jest.fn().mockResolvedValue({ ok: true });
jest.mock('@/state/readerDownloadsStore', () => {
  const actual = jest.requireActual('@/state/readerDownloadsStore');
  return { ...actual, downloadReadable: (...args: unknown[]) => mockDownloadReadable(...args) };
});

// A two-volume series group + a standalone single item.
function seriesItem(): OfflineItem {
  return {
    readableKey: 'page_file_1',
    readableKeys: ['page_file_1', 'page_file_2'],
    volumeCount: 2,
    title: 'Berserk Vol 1',
    seriesName: 'Berserk',
    contentType: 'manga',
    coverUrl: 'file:///d/cover.img',
    hue: 12,
    seriesId: 5,
    bytes: 3000,
    lastReadAt: 10,
    downloadedAt: 1000,
    resolved: true,
    broken: false,
    volumes: [
      { readableKey: 'page_file_1', title: 'Berserk Vol 1', bytes: 1000, broken: false, downloadedAt: 2000 },
      { readableKey: 'page_file_2', title: 'Berserk Vol 2', bytes: 2000, broken: false, downloadedAt: 1000 },
    ],
  };
}

function standaloneItem(): OfflineItem {
  return {
    readableKey: 'page_file_99',
    readableKeys: ['page_file_99'],
    volumeCount: 1,
    title: 'A Standalone Book',
    seriesName: 'A Standalone Book',
    contentType: 'ebook',
    coverUrl: null,
    hue: 150,
    seriesId: null,
    bytes: 500,
    lastReadAt: 5,
    downloadedAt: 5000,
    resolved: true,
    broken: false,
    volumes: [
      { readableKey: 'page_file_99', title: 'A Standalone Book', bytes: 500, broken: false, downloadedAt: 5000 },
    ],
  };
}

function setOnline(): void {
  useConnectivity.setState({ deviceOnline: true, serverReachable: true, lastPingAt: 0 });
}
function setOffline(): void {
  useConnectivity.setState({ deviceOnline: false, serverReachable: false, lastPingAt: 0 });
}

// Fix "now" so timeLeft is deterministic. 1000ms downloaded + 30d TTL - now.
const NOW = 1000 + 5 * 24 * 60 * 60 * 1000; // 25 days remaining for the series row

function renderDownloads() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <NavigationContainer>
            <Downloads now={() => NOW} />
          </NavigationContainer>
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  mockItems = [];
  mockSeriesData = undefined;
  mockRemoveOne.mockClear();
  mockRemoveMany.mockClear();
  mockDownloadReadable.mockClear();
  // Reset the in-flight downloads store so active-section tests don't bleed.
  useReaderDownloads.setState({ downloads: {} });
  setOnline();
});

it('renders the empty state when no downloads', async () => {
  await renderDownloads();
  await waitFor(() => expect(screen.getByText(/No downloads on this device/)).toBeTruthy());
});

it('renders the Downloads heading', async () => {
  await renderDownloads();
  await waitFor(() => expect(screen.getByText('Downloads')).toBeTruthy());
});

it('renders the Browse library button in the empty state', async () => {
  await renderDownloads();
  await waitFor(() => expect(screen.getByTestId('btn-browse-library')).toBeTruthy());
});

it('renders a series group row with the series name, volume count, and a time-left string', async () => {
  mockItems = [seriesItem()];
  await renderDownloads();
  await waitFor(() => expect(screen.getByTestId('download-series-5')).toBeTruthy());
  expect(screen.getByText('Berserk')).toBeTruthy();
  expect(screen.getByText('2 volumes')).toBeTruthy();
  // 25 days remaining → "25d left" on the series row's time-left text.
  const tl = screen.getAllByTestId('download-time-left');
  expect(tl.some((n) => n.props.children === '25d left')).toBe(true);
});

it('expands a series row on tap, revealing its per-volume rows', async () => {
  mockItems = [seriesItem()];
  await renderDownloads();
  await waitFor(() => expect(screen.getByTestId('download-series-5')).toBeTruthy());
  // Collapsed: no volume rows yet.
  expect(screen.queryByTestId('download-volume-page_file_2')).toBeNull();
  fireEvent.press(screen.getByTestId('download-series-expand-5'));
  await waitFor(() => expect(screen.getByTestId('download-volume-page_file_1')).toBeTruthy());
  expect(screen.getByTestId('download-volume-page_file_2')).toBeTruthy();
  expect(screen.getByText('Berserk Vol 2')).toBeTruthy();
});

it('per-volume Remove calls removeMany with that single key', async () => {
  mockItems = [seriesItem()];
  await renderDownloads();
  await waitFor(() => expect(screen.getByTestId('download-series-5')).toBeTruthy());
  fireEvent.press(screen.getByTestId('download-series-expand-5'));
  await waitFor(() => expect(screen.getByTestId('download-remove-volume-page_file_2')).toBeTruthy());
  fireEvent.press(screen.getByTestId('download-remove-volume-page_file_2'));
  expect(mockRemoveMany).toHaveBeenCalledWith(['page_file_2']);
});

it('per-series Remove all calls removeMany with every volume key', async () => {
  mockItems = [seriesItem()];
  await renderDownloads();
  await waitFor(() => expect(screen.getByTestId('download-remove-series-5')).toBeTruthy());
  fireEvent.press(screen.getByTestId('download-remove-series-5'));
  expect(mockRemoveMany).toHaveBeenCalledWith(['page_file_1', 'page_file_2']);
});

it('offline: Download rest of series is gated — toasts and does not enqueue', async () => {
  mockItems = [seriesItem()];
  mockSeriesData = { volumesList: [{ libraryFileId: 3, title: 'Berserk Vol 3', coverUrl: null }] };
  useToasts.setState({ toasts: [] });
  setOffline();
  await renderDownloads();
  await waitFor(() => expect(screen.getByTestId('download-series-download-5')).toBeTruthy());
  fireEvent.press(screen.getByTestId('download-series-download-5'));
  await waitFor(() =>
    expect(useToasts.getState().toasts.at(-1)?.message).toBe('Unavailable offline'),
  );
  expect(mockDownloadReadable).not.toHaveBeenCalled();
});

it('offline: per-volume Redownload is gated — toasts and does not enqueue', async () => {
  mockItems = [seriesItem()];
  mockSeriesData = { volumesList: [{ libraryFileId: 3, title: 'Berserk Vol 3', coverUrl: null }] };
  useToasts.setState({ toasts: [] });
  setOffline();
  await renderDownloads();
  await waitFor(() => expect(screen.getByTestId('download-series-expand-5')).toBeTruthy());
  fireEvent.press(screen.getByTestId('download-series-expand-5'));
  await waitFor(() => expect(screen.getByTestId('download-volume-redownload-page_file_2')).toBeTruthy());
  fireEvent.press(screen.getByTestId('download-volume-redownload-page_file_2'));
  await waitFor(() =>
    expect(useToasts.getState().toasts.at(-1)?.message).toBe('Unavailable offline'),
  );
  expect(mockDownloadReadable).not.toHaveBeenCalled();
});

it('online: Download rest of series enqueues only the volumes not already offline, with seriesName in meta', async () => {
  mockItems = [seriesItem()];
  // Vol 1 (file 1) + Vol 2 (file 2) are already offline (page_file_1/2); vol 3
  // (file 3) is the only new one to enqueue.
  mockSeriesData = {
    volumesList: [
      { libraryFileId: 1, title: 'Berserk Vol 1', coverUrl: null },
      { libraryFileId: 2, title: 'Berserk Vol 2', coverUrl: null },
      { libraryFileId: 3, title: 'Berserk Vol 3', coverUrl: 'http://c/3.jpg' },
    ],
  };
  await renderDownloads();
  await waitFor(() => expect(screen.getByTestId('download-series-download-5')).toBeTruthy());
  fireEvent.press(screen.getByTestId('download-series-download-5'));
  await waitFor(() => expect(mockDownloadReadable).toHaveBeenCalledTimes(1));
  const [key, meta] = mockDownloadReadable.mock.calls[0]!;
  expect(key).toBe('page:file:3');
  expect(meta.seriesName).toBe('Berserk');
  expect(meta.title).toBe('Berserk Vol 3');
  expect(meta.contentType).toBe('manga');
  expect(meta.serverUrl).toBe('https://srv');
  expect(meta.token).toBe('t');
});

it('renders a standalone (non-series) item as its own row, keyed by readableKey', async () => {
  mockItems = [standaloneItem()];
  await renderDownloads();
  // Standalone rows have no seriesId, so the testID falls back to readableKey.
  await waitFor(() => expect(screen.getByTestId('download-series-page_file_99')).toBeTruthy());
  expect(screen.getByText('A Standalone Book')).toBeTruthy();
  fireEvent.press(screen.getByTestId('download-remove-series-page_file_99'));
  expect(mockRemoveMany).toHaveBeenCalledWith(['page_file_99']);
});

// ── Paused / Resume / Retry ────────────────────────────────────────────────

it('paused entry: renders a Paused badge + progress bar + Resume button', async () => {
  // Seed the in-flight downloads store with a paused entry.
  useReaderDownloads.setState({
    downloads: {
      'page:file:77': {
        state: 'paused',
        pct: 42,
        bytes: 500_000,
        title: 'Berserk Vol 7',
        seriesName: 'Berserk',
        contentType: 'manga',
        coverUrl: null,
        volumeLabel: 'Vol. 7',
      },
    },
  });
  await renderDownloads();
  // The "In progress" section must appear.
  await waitFor(() => expect(screen.getByTestId('download-inprogress-page:file:77')).toBeTruthy());
  // Paused badge is rendered.
  expect(screen.getByText('Paused')).toBeTruthy();
  // Progress bar % is shown (42%).
  expect(screen.getByText(/42%/)).toBeTruthy();
  // Resume button is rendered.
  expect(screen.getByTestId('dl-resume-page:file:77')).toBeTruthy();
});

it('paused entry: pressing Resume calls downloadReadable with the key + creds + meta', async () => {
  useReaderDownloads.setState({
    downloads: {
      'page:file:77': {
        state: 'paused',
        pct: 42,
        bytes: 500_000,
        title: 'Berserk Vol 7',
        seriesName: 'Berserk',
        contentType: 'manga',
        coverUrl: null,
        volumeLabel: 'Vol. 7',
      },
    },
  });
  await renderDownloads();
  await waitFor(() => expect(screen.getByTestId('dl-resume-page:file:77')).toBeTruthy());
  fireEvent.press(screen.getByTestId('dl-resume-page:file:77'));
  await waitFor(() => expect(mockDownloadReadable).toHaveBeenCalledTimes(1));
  const [key, meta] = mockDownloadReadable.mock.calls[0]!;
  expect(key).toBe('page:file:77');
  expect(meta.serverUrl).toBe('https://srv');
  expect(meta.token).toBe('t');
  expect(meta.title).toBe('Berserk Vol 7');
  expect(meta.seriesName).toBe('Berserk');
  expect(meta.contentType).toBe('manga');
  expect(meta.volumeLabel).toBe('Vol. 7');
});

it('error entry: renders a Retry button', async () => {
  useReaderDownloads.setState({
    downloads: {
      'page:file:88': {
        state: 'error',
        pct: 10,
        bytes: 100_000,
        title: 'Berserk Vol 8',
        seriesName: 'Berserk',
        contentType: 'manga',
        coverUrl: null,
        volumeLabel: 'Vol. 8',
      },
    },
  });
  await renderDownloads();
  await waitFor(() => expect(screen.getByTestId('download-inprogress-page:file:88')).toBeTruthy());
  expect(screen.getByTestId('dl-retry-page:file:88')).toBeTruthy();
});
