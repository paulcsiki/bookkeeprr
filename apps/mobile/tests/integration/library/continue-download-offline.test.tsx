import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { useConnectivity } from '@/state/connectivityStore';
import { useToasts } from '@/state/toastStore';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ navigate: jest.fn() }),
    useFocusEffect: (cb: () => void) => cb(),
  };
});

// downloadReadable is the trigger we must NOT call offline.
const mockDownloadReadable = jest.fn();
jest.mock('@/state/readerDownloadsStore', () => ({
  downloadReadable: (...a: unknown[]) => mockDownloadReadable(...a),
  useReaderDownloads: (sel: (s: { downloads: Record<string, unknown> }) => unknown) => sel({ downloads: {} }),
}));

const mockCR = jest.fn();
jest.mock('@/api/hooks/useContinueReading', () => ({ useContinueReading: () => mockCR() }));
jest.mock('@/api/hooks/useResetReadingProgress', () => ({
  useResetReadingProgress: () => ({ mutate: jest.fn(), isPending: false }),
}));

import { AuthProvider } from '@/auth/AuthContext';
import { ContinueReadingRail } from '@/features/library/ContinueReadingRail';

const ITEM = {
  id: 1, readableKey: 'page:file:42', title: 'Berserk', contentType: 'manga' as const,
  coverUrl: null, position: 0.3, finished: false,
};
function setOffline() { useConnectivity.setState({ deviceOnline: false, serverReachable: false }); }
function renderRail() {
  return render(<ThemeProvider><AuthProvider><ContinueReadingRail /></AuthProvider></ThemeProvider>);
}

beforeEach(() => {
  mockDownloadReadable.mockClear();
  useToasts.setState({ toasts: [] });
  mockCR.mockReturnValue({ data: { items: [ITEM] }, refetch: jest.fn() });
});

it('offline: tapping the download button does not start a download + toasts', async () => {
  setOffline();
  renderRail();
  await waitFor(() => expect(screen.getByTestId('continue-download-1')).toBeTruthy());
  fireEvent.press(screen.getByTestId('continue-download-1'));
  expect(mockDownloadReadable).not.toHaveBeenCalled();
  expect(useToasts.getState().toasts.at(-1)?.message).toBe('Unavailable offline');
});

it('online: tapping the download button starts the download (no regression)', async () => {
  renderRail();
  await waitFor(() => expect(screen.getByTestId('continue-download-1')).toBeTruthy());
  fireEvent.press(screen.getByTestId('continue-download-1'));
  expect(mockDownloadReadable).toHaveBeenCalledTimes(1);
});
