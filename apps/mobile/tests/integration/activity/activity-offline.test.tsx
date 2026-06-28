import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/auth/AuthContext';
import { useConnectivity } from '@/state/connectivityStore';
import { useToasts } from '@/state/toastStore';

// QueueRow/HistoryRow call useAuth() for the image auth header — wrap in
// AuthProvider and stub the token store so it resolves without secure storage.
jest.mock('@/auth/token-store', () => ({
  tokenStore: {
    load: jest.fn().mockResolvedValue({
      serverUrl: 'https://srv',
      token: 't',
      refreshToken: 'r',
      expiresAt: '2026-08-25T00:00:00Z',
      certFingerprint: null,
    }),
    save: jest.fn(),
    clear: jest.fn(),
  },
}));

const mockDownloads = jest.fn();
const mockDelMutate = jest.fn();
jest.mock('@/api/hooks', () => ({
  useDownloads: () => mockDownloads(),
  useDeleteDownload: () => ({ mutate: mockDelMutate }),
}));

// Default phone layout (portrait). The tablet test overrides this flag.
// `mock`-prefixed so babel-jest-hoist allows it inside the factory.
let mockLandscape = false;
jest.mock('@/responsive/useLayout', () => ({
  useLayout: () => ({ isLandscape: mockLandscape, isTablet: mockLandscape }),
}));

import Activity from '@/screens/Activity';

const DL = {
  id: 5,
  qbtHash: 'hash-5',
  status: 'downloading' as const,
  addedAt: '2026-06-10T00:00:00Z',
  title: 'Berserk v1',
  progress: 0.5,
};
function setOffline() {
  useConnectivity.setState({ deviceOnline: false, serverReachable: false });
}
function renderActivity() {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <Activity />
      </AuthProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  mockLandscape = false;
  mockDelMutate.mockClear();
  useToasts.setState({ toasts: [] });
  mockDownloads.mockReturnValue({ data: { downloads: [DL] }, refetch: jest.fn(), dataUpdatedAt: 0 });
});

it('offline + no cache: shows the offline card, not the loading text', async () => {
  setOffline();
  mockDownloads.mockReturnValue({ data: undefined, isLoading: true, refetch: jest.fn(), dataUpdatedAt: 0 });
  renderActivity();
  await waitFor(() => expect(screen.getByText("You're offline")).toBeTruthy());
  expect(screen.queryByTestId('activity-loading')).toBeNull();
});

it('offline (phone): swipe-delete does not call useDeleteDownload + toasts', async () => {
  setOffline();
  renderActivity();
  await waitFor(() => expect(screen.getByTestId('swipe-delete-5')).toBeTruthy());
  // The mocked ReanimatedSwipeable fires onDelete on pressing the action testID.
  fireEvent.press(screen.getByTestId('swipe-delete-5'));
  expect(mockDelMutate).not.toHaveBeenCalled();
  expect(useToasts.getState().toasts.at(-1)?.message).toBe('Unavailable offline');
});

it('offline (tablet-landscape): swipe-delete in the split is gated + toasts', async () => {
  mockLandscape = true;
  setOffline();
  renderActivity();
  await waitFor(() => expect(screen.getByTestId('activity-split')).toBeTruthy());
  fireEvent.press(screen.getByTestId('swipe-delete-5'));
  expect(mockDelMutate).not.toHaveBeenCalled();
  expect(useToasts.getState().toasts.at(-1)?.message).toBe('Unavailable offline');
});

it('online (phone): swipe-delete calls useDeleteDownload (no regression)', async () => {
  renderActivity();
  await waitFor(() => expect(screen.getByTestId('swipe-delete-5')).toBeTruthy());
  fireEvent.press(screen.getByTestId('swipe-delete-5'));
  expect(mockDelMutate).toHaveBeenCalledWith('hash-5');
});
