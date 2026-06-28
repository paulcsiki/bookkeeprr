import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { ContinueReadingItem } from '@/api/schemas';

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

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ navigate: jest.fn() }),
    // The rail refetches on focus; run the effect once without the real
    // navigation-context plumbing (no NavigationContainer in this test).
    useFocusEffect: (cb: () => void | (() => void)) => {
      cb();
    },
  };
});

const mockUseContinueReading = jest.fn();
jest.mock('@/api/hooks/useContinueReading', () => ({
  useContinueReading: () => ({ refetch: jest.fn(), ...mockUseContinueReading() }),
}));

// The rail uses the reset mutation (long-press → remove); mock it so this
// bare render needs no QueryClientProvider.
jest.mock('@/api/hooks/useResetReadingProgress', () => ({
  useResetReadingProgress: () => ({ mutate: jest.fn(), isPending: false }),
}));

import { AuthProvider } from '@/auth/AuthContext';
import { ContinueReadingRail } from '@/features/library/ContinueReadingRail';
import { useReaderDownloads, downloadsHydrated } from '@/state/readerDownloadsStore';

function item(overrides: Partial<ContinueReadingItem> = {}): ContinueReadingItem {
  return {
    id: 1,
    readableKey: 'page:file:42',
    seriesId: 7,
    volumeId: 3,
    libraryFileId: 42,
    contentType: 'comic',
    position: 0.5,
    locatorJson: '{"page":10}',
    finished: false,
    updatedAt: 1_700_000_000_000,
    title: 'Berserk',
    coverUrl: null,
    ...overrides,
  };
}

async function renderRail() {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <ContinueReadingRail />
      </AuthProvider>
    </ThemeProvider>,
  );
}

beforeEach(async () => {
  // Let the store's initial async AsyncStorage hydration finish first — otherwise
  // it can resolve mid-test (under full-suite load) and clobber the download map
  // we set below back to empty, dropping the OFFLINE badge.
  await downloadsHydrated;
  mockUseContinueReading.mockReset();
  useReaderDownloads.setState({ downloads: {} });
});

it('shows a download affordance per card when not yet downloaded', async () => {
  mockUseContinueReading.mockReturnValue({ data: { items: [item({ id: 1 })] } });
  await renderRail();
  // waitFor: the rail renders its cards only once AuthProvider settles to
  // authenticated, which can lag under full-suite parallel load.
  await waitFor(() => expect(screen.getByTestId('continue-download-1')).toBeTruthy());
});

it('shows an OFFLINE badge once the readable is marked done', async () => {
  useReaderDownloads.setState({
    downloads: { 'page:file:42': { state: 'done', pct: 100, bytes: 0, localPath: '/x' } },
  });
  mockUseContinueReading.mockReturnValue({
    data: { items: [item({ id: 1, readableKey: 'page:file:42' })] },
  });
  await renderRail();
  // The offline state is now a bare green check badge (no "OFFLINE" text).
  await waitFor(() => expect(screen.getByTestId('continue-offline-1')).toBeTruthy());
});

// Runs LAST: the tap fires a real async downloadReadable whose later
// complete/fail setState would bleed into (and clobber) a following test's
// store state. Keeping it last means nothing follows it to pollute.
it('records download intent in the store when the affordance is tapped', async () => {
  mockUseContinueReading.mockReturnValue({
    data: { items: [item({ id: 1, readableKey: 'page:file:42' })] },
  });
  await renderRail();
  await waitFor(() => expect(screen.getByTestId('continue-download-1')).toBeTruthy());
  await fireEvent.press(screen.getByTestId('continue-download-1'));
  expect(useReaderDownloads.getState().getDownload('page:file:42')).toBeDefined();
});
