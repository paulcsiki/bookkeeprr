import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { ReaderThemeProvider } from '@/features/reader/ReaderThemeContext';
import type { ReaderManifest } from '@/api/schemas';

// Landscape/wide viewport so the two-up spread activates (it falls back to
// single on narrow/portrait phones). Overrides the portrait default from
// tests/setup.ts for this file only.
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 1180, height: 820 }),
}));

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

const commit = jest.fn();
const mockUseReadingProgress = jest.fn();
jest.mock('@/api/hooks/useReadingProgress', () => ({
  useReadingProgress: (...args: unknown[]) => mockUseReadingProgress(...args),
}));

// A comic (LTR by default) starting on page 0, with enough pages for a spread.
const manifest: ReaderManifest = {
  readableKey: 'page:file:42',
  contentType: 'comic',
  reader: 'comics',
  format: 'cbz',
  title: 'Saga',
  seriesId: 1,
  volumeId: 7,
  volumeLabel: 'Vol. 1',
  pageCount: 6,
  progress: {
    readableKey: 'page:file:42',
    position: 0,
    locator: { page: 0 },
    finished: false,
    restartedFromFinish: false,
  },
};

async function renderReader() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <ReaderThemeProvider initialThemeKey="oled">
            <ComicsReader manifest={manifest} onBack={jest.fn()} />
          </ReaderThemeProvider>
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

async function flushAuth() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  commit.mockClear();
  mockUseReadingProgress.mockReset();
  mockUseReadingProgress.mockReturnValue({ progress: manifest.progress, commit });
});

it('renders single (not spread) until Spread is selected', async () => {
  await renderReader();
  await flushAuth();
  expect(screen.getByTestId('reader-comic-page')).toBeTruthy();
  expect(screen.queryByTestId('reader-comic-spread')).toBeNull();
});

it('renders a two-up spread side-by-side on a wide viewport', async () => {
  await renderReader();
  await flushAuth();

  await fireEvent.press(screen.getByTestId('reader-settings-btn'));
  await fireEvent.press(screen.getByText('Spread'));
  await fireEvent.press(screen.getByTestId('reader-settings-sheet-scrim'));

  // LTR spread from page 0 shows pages [0, 1] left→right.
  expect(screen.getByTestId('reader-comic-spread')).toBeTruthy();
  expect(screen.getByTestId('reader-comic-page-0')).toBeTruthy();
  expect(screen.getByTestId('reader-comic-page-1')).toBeTruthy();
});

it('advances by two pages per tap in spread mode', async () => {
  await renderReader();
  await flushAuth();

  await fireEvent.press(screen.getByTestId('reader-settings-btn'));
  await fireEvent.press(screen.getByText('Spread'));
  await fireEvent.press(screen.getByTestId('reader-settings-sheet-scrim'));

  const overlay = screen.getByTestId('reader-tap-overlay');
  await fireEvent(overlay, 'layout', { nativeEvent: { layout: { width: 1180, height: 820 } } });
  // Right edge → forward in LTR.
  await fireEvent(overlay, 'press', { nativeEvent: { locationX: 1100, locationY: 400 } });

  // page 0 → page 2 (step 2). page 2 of 6 → position 0.4.
  expect(commit).toHaveBeenLastCalledWith(0.4, { page: 2 });
  expect(screen.getByTestId('reader-comic-page-2')).toBeTruthy();
  expect(screen.getByTestId('reader-comic-page-3')).toBeTruthy();
});
