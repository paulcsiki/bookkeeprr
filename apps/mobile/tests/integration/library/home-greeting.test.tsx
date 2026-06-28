import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { useProfile } from '@/state/profileStore';
import { useConnectivity } from '@/state/connectivityStore';

// Mock the on-mount dashboard hooks so NO real request fires (SP1 reachability trap).
jest.mock('@/api/hooks/useDashboard', () => ({ useDashboard: () => ({ data: undefined, refetch: jest.fn() }) }));
jest.mock('@/api/hooks/useDashboardPrefs', () => ({
  useDashboardPrefs: () => ({ data: undefined, refetch: jest.fn() }),
  useSetDashboardPrefs: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@/api/hooks/useContinueReading', () => ({ useContinueReading: () => ({ data: undefined, refetch: jest.fn() }) }));
jest.mock('@/api/hooks/useResetReadingProgress', () => ({
  useResetReadingProgress: () => ({ mutate: jest.fn(), isPending: false }),
}));
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ navigate: mockNavigate, getParent: () => ({ navigate: mockNavigate }) }),
    useFocusEffect: (cb: () => void) => cb(),
  };
});

import { AuthProvider } from '@/auth/AuthContext';
import HomeDashboard from '@/screens/HomeDashboard';

function renderHome() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <AuthProvider>
          <HomeDashboard />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockNavigate.mockClear();
  // Render offline so the greeting must come from the CACHE (no network).
  useConnectivity.setState({ deviceOnline: false, serverReachable: false });
  useProfile.setState({
    id: 7, username: 'paul', displayName: 'Alex Example', email: 'p@x.io',
    avatarUrl: null, avatarLocalPath: null, fetchedAt: 1,
  });
});

it('offline: greeting uses the cached profile name + renders an Avatar', async () => {
  renderHome();
  await waitFor(() => expect(screen.getByTestId('screen-home')).toBeTruthy());
  expect(screen.getByText(/, Alex$/)).toBeTruthy(); // greeting ends with the first name
  expect(screen.getByTestId('avatar-initials')).toBeTruthy(); // no local image → initials
});

it('offline: renders the cached avatar image when a local path is cached', async () => {
  // Store the avatar path in the new RELATIVE format (relative to DocumentDir).
  // Avatar.tsx resolves it via resolveOffline() to the current absolute path.
  // The blob-util mock sets DocumentDir to '/mock/Documents'.
  useProfile.setState({
    id: 7, username: 'paul', displayName: 'Alex Example', email: 'p@x.io',
    avatarUrl: null, avatarLocalPath: 'profile/avatar', fetchedAt: 1,
  });
  renderHome();
  await waitFor(() => expect(screen.getByTestId('screen-home')).toBeTruthy());
  // The avatar image must point at the LOCAL file (offline-safe), not a remote URL.
  // resolveOffline('profile/avatar') → '/mock/Documents/profile/avatar'
  expect(JSON.stringify(screen.getByTestId('avatar-image').props)).toContain('file:///mock/Documents/profile/avatar');
});

it('online: tapping the home avatar opens the current user profile', async () => {
  useConnectivity.setState({ deviceOnline: true, serverReachable: true });
  useProfile.setState({
    id: 7, username: 'paul', displayName: 'Alex Example', email: 'p@x.io',
    avatarUrl: null, avatarLocalPath: null, fetchedAt: 1,
  });
  renderHome();
  await waitFor(() => expect(screen.getByTestId('home-avatar-btn')).toBeTruthy());
  fireEvent.press(screen.getByTestId('home-avatar-btn'));
  expect(mockNavigate).toHaveBeenCalledWith('UserProfile', { userId: 7 });
});

it('empty profile cache falls back to "reader"', async () => {
  useProfile.setState({ id: null, username: null, displayName: null, email: null, avatarUrl: null, avatarLocalPath: null, fetchedAt: 0 });
  renderHome();
  await waitFor(() => expect(screen.getByText(/, reader$/)).toBeTruthy());
});
