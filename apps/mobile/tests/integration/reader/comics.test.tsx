import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { ReaderThemeProvider } from '@/features/reader/ReaderThemeContext';
import type { ReaderManifest } from '@/api/schemas';

// Drive the auth context with a fixed bearer token + server URL so the page
// image URIs and Authorization header are deterministic.
jest.mock('@/auth/token-store', () => ({
  tokenStore: {
    load: jest.fn().mockResolvedValue({
      serverUrl: 'https://srv.example',
      token: 'tok-123',
      refreshToken: 'r',
      expiresAt: '2099-01-01T00:00:00Z',
      certFingerprint: null,
    }),
    save: jest.fn(),
    clear: jest.fn(),
  },
}));

import { AuthProvider } from '@/auth/AuthContext';
import { ComicsReader } from '@/features/reader/ComicsReader';
import { useReaderDownloads } from '@/state/readerDownloadsStore';

// Capture the readableKey + commits the reader makes so we can assert the
// page→position write happens on a turn, without a network round-trip.
const commit = jest.fn();
const mockUseReadingProgress = jest.fn();
jest.mock('@/api/hooks/useReadingProgress', () => ({
  useReadingProgress: (...args: unknown[]) => mockUseReadingProgress(...args),
}));

const manifest: ReaderManifest = {
  readableKey: 'page:file:42',
  contentType: 'comic',
  reader: 'comics',
  format: 'cbz',
  title: 'Berserk',
  seriesId: 1,
  volumeId: 7,
  volumeLabel: 'Vol. 1',
  pageCount: 3,
  progress: {
    readableKey: 'page:file:42',
    position: 0,
    locator: { page: 0 },
    finished: false,
    restartedFromFinish: false,
  },
};

async function renderReader(onBack = jest.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = await render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <ReaderThemeProvider initialThemeKey="oled">
            <ComicsReader manifest={manifest} onBack={onBack} />
          </ReaderThemeProvider>
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
  return { ...utils, onBack };
}

/** Wait one microtask tick so AuthProvider settles to authenticated. */
async function flushAuth() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  commit.mockClear();
  mockUseReadingProgress.mockReset();
  mockUseReadingProgress.mockReturnValue({ progress: manifest.progress, commit });
  // Default: no offline download — the reader streams from the network.
  useReaderDownloads.setState({ downloads: {} });
});

it('renders the active comic page from the bearer-authed serving route', async () => {
  await renderReader();
  await flushAuth();

  const page = screen.getByTestId('reader-comic-page');
  const source = page.props.source as { uri: string; headers: Record<string, string> };
  expect(source.uri).toBe('https://srv.example/api/reader/comics/42/page/0');
  expect(source.headers.Authorization).toBe('Bearer tok-123');
});

it('loads the local file:// page when an offline download is done', async () => {
  // Seed a completed offline download for this readable.
  // localPaths are now RELATIVE to DocumentDir (the mock is '/mock/Documents').
  useReaderDownloads.setState({
    downloads: {
      'page:file:42': {
        state: 'done',
        pct: 100,
        bytes: 0,
        localPath: 'reader/page_file_42/page-0',
        localPaths: [
          'reader/page_file_42/page-0',
          'reader/page_file_42/page-1',
          'reader/page_file_42/page-2',
        ],
      },
    },
  });

  await renderReader();
  await flushAuth();

  const page = screen.getByTestId('reader-comic-page');
  const source = page.props.source as { uri: string; headers?: Record<string, string> };
  // resolveOffline() prepends the mock DocumentDir before toFileUri().
  expect(source.uri).toBe('file:///mock/Documents/reader/page_file_42/page-0');
  // A local file carries no Authorization header.
  expect(source.headers).toBeUndefined();
});

it('passes the manifest readableKey to useReadingProgress', async () => {
  await renderReader();
  await flushAuth();
  expect(mockUseReadingProgress).toHaveBeenCalledWith(
    'page:file:42',
    expect.objectContaining({ seriesId: 1, contentType: 'comic' }),
    manifest.progress,
  );
});

it('a forward tap advances the rendered page and commits the new position', async () => {
  await renderReader();
  await flushAuth();

  // Tap the right edge of a 400px-wide overlay (relX ~0.875 → forward in LTR).
  const overlay = screen.getByTestId('reader-tap-overlay');
  await fireEvent(overlay, 'layout', { nativeEvent: { layout: { width: 400, height: 800 } } });
  await fireEvent(overlay, 'press', { nativeEvent: { locationX: 350, locationY: 400 } });

  const page = screen.getByTestId('reader-comic-page');
  const source = page.props.source as { uri: string };
  expect(source.uri).toBe('https://srv.example/api/reader/comics/42/page/1');
  // page 1 of 3 → position 0.5
  expect(commit).toHaveBeenLastCalledWith(0.5, { page: 1 });
});

it('a left-swipe advances the page (LTR), without a competing tap', async () => {
  await renderReader();
  await flushAuth();

  const overlay = screen.getByTestId('reader-tap-overlay');
  await fireEvent(overlay, 'layout', { nativeEvent: { layout: { width: 400, height: 800 } } });
  // Press starts on the right, releases far to the left → a leftward swipe.
  await fireEvent(overlay, 'pressIn', { nativeEvent: { locationX: 320, locationY: 400 } });
  await fireEvent(overlay, 'press', { nativeEvent: { locationX: 60, locationY: 400 } });

  const page = screen.getByTestId('reader-comic-page');
  const source = page.props.source as { uri: string };
  expect(source.uri).toBe('https://srv.example/api/reader/comics/42/page/1');
  // Swiped forward exactly one page (no tap-zone "back" firing on release).
  expect(commit).toHaveBeenLastCalledWith(0.5, { page: 1 });
});

it('a center tap toggles the chrome', async () => {
  await renderReader();
  await flushAuth();
  expect(screen.getByTestId('reader-back')).toBeTruthy();

  const overlay = screen.getByTestId('reader-tap-overlay');
  await fireEvent(overlay, 'layout', { nativeEvent: { layout: { width: 400, height: 800 } } });
  await fireEvent(overlay, 'press', { nativeEvent: { locationX: 200, locationY: 400 } });

  expect(screen.queryByTestId('reader-back')).toBeNull();
});

it('renders the back affordance and forwards onBack', async () => {
  const { onBack } = await renderReader();
  await flushAuth();
  await fireEvent.press(screen.getByTestId('reader-back'));
  expect(onBack).toHaveBeenCalled();
});

it('switches webtoon pages to the offline copy when a download completes mid-session', async () => {
  // Start with no offline copy — the reader is streaming.
  await renderReader();
  await flushAuth();

  // Switch to webtoon (continuous-scroll) layout.
  await fireEvent.press(screen.getByTestId('reader-settings-btn'));
  await fireEvent.press(screen.getByText('Webtoon'));
  await fireEvent.press(screen.getByTestId('reader-settings-sheet-scrim'));

  // No download yet: the list has no offline re-render trigger.
  expect(screen.getByTestId('reader-webtoon').props.extraData ?? null).toBeNull();

  // The background download for THIS readable finishes while the reader is open.
  // localPaths are now RELATIVE to DocumentDir (the mock is '/mock/Documents').
  const localPaths = [
    'reader/page_file_42/page-0',
    'reader/page_file_42/page-1',
    'reader/page_file_42/page-2',
  ];
  await act(async () => {
    useReaderDownloads.setState({
      downloads: { 'page:file:42': { state: 'done', pct: 100, bytes: 0, localPaths } },
    });
    await Promise.resolve();
  });

  // The webtoon list must be told its item content changed (FlashList only
  // re-renders materialized cells on a data/extraData change), so already-shown
  // pages flip to the local file:// copy instead of streaming until remount.
  expect(screen.getByTestId('reader-webtoon').props.extraData).toEqual(localPaths);
});

it('webtoon scroll commits progress for the first visible page', async () => {
  await renderReader();
  await flushAuth();

  // Switch to webtoon layout via settings.
  await fireEvent.press(screen.getByTestId('reader-settings-btn'));
  await fireEvent.press(screen.getByText('Webtoon'));
  // Dismiss the settings overlay so the webtoon list is interactable.
  await fireEvent.press(screen.getByTestId('reader-settings-sheet-scrim'));

  const list = screen.getByTestId('reader-webtoon');
  // The mock surfaces `onViewableItemsChanged`; simulate page 2 scrolling in.
  act(() => {
    list.props.onViewableItemsChanged({
      viewableItems: [{ index: 2, isViewable: true }],
    });
  });

  // page 2 of 3 → position 1
  expect(commit).toHaveBeenLastCalledWith(1, { page: 2 });
});
