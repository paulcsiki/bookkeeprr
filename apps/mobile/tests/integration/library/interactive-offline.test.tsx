import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { useConnectivity } from '@/state/connectivityStore';
import { useToasts } from '@/state/toastStore';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }),
    useRoute: () => ({ params: { seriesId: '7' } }),
  };
});

const mockSearch = jest.fn();
const mockGrab = jest.fn();
const mockRefetch = jest.fn();
jest.mock('@/api/hooks', () => ({
  useSeries: () => ({ data: { title: 'Berserk' } }),
  useInteractiveSearch: () => mockSearch(),
  useGrabRelease: () => ({ mutateAsync: mockGrab }),
}));

import InteractiveSearch from '@/screens/library/InteractiveSearch';

const RELEASE = {
  releaseId: 11, title: 'Berserk v1 [Group]', quality: 'CBZ', indexer: 'Nyaa',
  sizeBytes: 50 * 1024 * 1024, seeders: 9, leechers: 1, publishedAt: '2026-06-01T00:00:00Z',
  accepted: true, recommended: false, rejectionReason: null,
};
function setOffline() { useConnectivity.setState({ deviceOnline: false, serverReachable: false }); }
function renderIS() { return render(<ThemeProvider><InteractiveSearch /></ThemeProvider>); }

beforeEach(() => {
  mockGrab.mockClear();
  mockRefetch.mockClear();
  useToasts.setState({ toasts: [] });
  mockSearch.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: mockRefetch });
});

it('offline + no cache: shows the offline card, not the ActivityIndicator', async () => {
  setOffline();
  renderIS();
  await waitFor(() => expect(screen.getByText("You're offline")).toBeTruthy());
  // The manual-grab CTA is hidden while the offline card stands in for content.
  expect(screen.queryByTestId('btn-grab-11')).toBeNull();
});

it('offline: grab is gated → no mutateAsync, toast; row disabled', async () => {
  setOffline();
  mockSearch.mockReturnValue({
    data: { releases: [RELEASE], indexerCount: 1, tookMs: 5 },
    isLoading: false, isError: false, refetch: mockRefetch,
  });
  renderIS();
  await waitFor(() => expect(screen.getByTestId('btn-grab-11')).toBeTruthy());
  const btn = screen.getByTestId('btn-grab-11');
  expect(btn.props.accessibilityState?.disabled).toBe(true);
  fireEvent.press(btn);
  expect(mockGrab).not.toHaveBeenCalled();
  expect(useToasts.getState().toasts.at(-1)?.message).toBe('Unavailable offline');
});

it('offline: refresh is gated → no refetch, toast', async () => {
  setOffline();
  mockSearch.mockReturnValue({
    data: { releases: [], indexerCount: 0, tookMs: 1 },
    isLoading: false, isError: false, refetch: mockRefetch,
  });
  renderIS();
  await waitFor(() => expect(screen.getByTestId('btn-refresh-interactive')).toBeTruthy());
  fireEvent.press(screen.getByTestId('btn-refresh-interactive'));
  expect(mockRefetch).not.toHaveBeenCalled();
  expect(useToasts.getState().toasts.at(-1)?.message).toBe('Unavailable offline');
});

it('offline: manual-grab is gated → sheet never opens, toast', async () => {
  setOffline();
  mockSearch.mockReturnValue({
    data: { releases: [], indexerCount: 0, tookMs: 1 },
    isLoading: false, isError: false, refetch: mockRefetch,
  });
  renderIS();
  await waitFor(() => expect(screen.getByTestId('btn-manual-grab')).toBeTruthy());
  fireEvent.press(screen.getByTestId('btn-manual-grab'));
  expect(screen.queryByTestId('manual-grab-sheet')).toBeNull();
  expect(useToasts.getState().toasts.at(-1)?.message).toBe('Unavailable offline');
});

it('online: grab fires mutateAsync (no regression)', async () => {
  mockGrab.mockResolvedValue({});
  mockSearch.mockReturnValue({
    data: { releases: [RELEASE], indexerCount: 1, tookMs: 5 },
    isLoading: false, isError: false, refetch: mockRefetch,
  });
  renderIS();
  await waitFor(() => expect(screen.getByTestId('btn-grab-11')).toBeTruthy());
  fireEvent.press(screen.getByTestId('btn-grab-11'));
  expect(mockGrab).toHaveBeenCalledWith(11);
});
