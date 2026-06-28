import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/auth/AuthContext';
import { useConnectivity } from '@/state/connectivityStore';
import { useToasts } from '@/state/toastStore';

jest.mock('@/auth/token-store', () => ({
  tokenStore: {
    load: jest.fn().mockResolvedValue(null),
    save: jest.fn(),
    clear: jest.fn(),
  },
}));

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return { ...actual, useNavigation: () => ({ goBack: mockGoBack, navigate: jest.fn() }) };
});

// Data hooks — paused-query shape offline (data undefined). The offline tests
// don't fire real requests, so connectivity never gets flipped by an unmocked
// request; we drive it explicitly.
const mockBrowse = jest.fn();
jest.mock('@/api/hooks/useDiscoverBrowse', () => ({ useDiscoverBrowse: () => mockBrowse() }));
jest.mock('@/api/hooks/useDiscoverSources', () => ({
  useDiscoverSources: () => ({ data: undefined }),
}));
jest.mock('@/api/hooks/useDiscoverSearch', () => ({
  useDiscoverSearch: () => ({ data: undefined, isSuccess: false, isError: false }),
}));
jest.mock('@/api/hooks/useDiscoverCategory', () => ({
  useDiscoverCategory: () => ({ data: undefined, isLoading: false, isError: false, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() }),
}));
// The add mutation — assert it is NOT called offline.
const mockAddMutate = jest.fn();
jest.mock('@/api/hooks/useAddSeries', () => ({
  useAddSeries: () => ({ mutate: mockAddMutate, isPending: false }),
}));
jest.mock('@/api/hooks/useQualityProfiles', () => ({
  useQualityProfiles: () => ({ data: [{ id: 1, name: 'Default', isDefault: true }], isLoading: false }),
  defaultProfileId: (profiles: { id: number }[] | undefined) => profiles?.[0]?.id,
}));

import DiscoverHome from '@/screens/discover/DiscoverHome';

function setOffline() { useConnectivity.setState({ deviceOnline: false, serverReachable: false }); }
function renderDiscover() {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <DiscoverHome />
      </AuthProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  mockGoBack.mockClear();
  mockAddMutate.mockClear();
  useToasts.setState({ toasts: [] });
  // Default: a paused browse query (offline) — data undefined, isLoading true.
  mockBrowse.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: jest.fn() });
});

it('offline browse: shows the offline card, not the RiffleLoader spinner', async () => {
  setOffline();
  renderDiscover();
  await waitFor(() => expect(screen.getByText("You're offline")).toBeTruthy());
  // The RiffleLoader caption text isn't shown; assert no add/loader leaked.
  expect(screen.queryByTestId('discover-loader')).toBeNull();
});

it('offline: tapping an add tile does not call useAddSeries and toasts', async () => {
  // Provide a browse row with one tile so a discover-add-* exists, while offline.
  setOffline();
  mockBrowse.mockReturnValue({
    data: {
      rows: [{ id: 'r1', label: 'Popular', meta: '', items: [
        { title: 'Berserk', contentType: 'manga', author: 'Miura', coverUrl: null, detail: null, inLib: false, sourceId: 'src-1', year: 1989 },
      ] }],
    },
    isLoading: false, isError: false, refetch: jest.fn(),
  });
  renderDiscover();
  await waitFor(() => expect(screen.getByTestId('discover-add-src-1')).toBeTruthy());
  fireEvent.press(screen.getByTestId('discover-add-src-1'));
  expect(mockAddMutate).not.toHaveBeenCalled();
  // Optimistic check must NOT appear (the gate wraps onAddTile before setAdded).
  expect(useToasts.getState().toasts.at(-1)?.message).toBe('Unavailable offline');
});

it('offline: see-all is gated → toast, no category mode', async () => {
  setOffline();
  mockBrowse.mockReturnValue({
    data: { rows: [{ id: 'r1', label: 'Popular', meta: '', items: [] }] },
    isLoading: false, isError: false, refetch: jest.fn(),
  });
  renderDiscover();
  await waitFor(() => expect(screen.getByTestId('see-all-r1')).toBeTruthy());
  fireEvent.press(screen.getByTestId('see-all-r1'));
  expect(useToasts.getState().toasts.at(-1)?.message).toBe('Unavailable offline');
});

it('offline: submitting the search field is gated → toast, stays in browse', async () => {
  setOffline();
  mockBrowse.mockReturnValue({
    data: { rows: [{ id: 'r1', label: 'Popular', meta: '', items: [] }] },
    isLoading: false, isError: false, refetch: jest.fn(),
  });
  renderDiscover();
  await waitFor(() => expect(screen.getByTestId('discover-search-input')).toBeTruthy());
  // Wrap the controlled-input update + submit in act so React 19's concurrent
  // root flushes them within this test (otherwise the pending TextInput update
  // leaks into the next test's render).
  await act(async () => {
    fireEvent.changeText(screen.getByTestId('discover-search-input'), 'naruto');
  });
  await act(async () => {
    fireEvent(screen.getByTestId('discover-search-input'), 'submitEditing');
  });
  // No searching loader (gate no-ops the mode change).
  expect(screen.queryByTestId('discover-loader')).toBeNull();
  expect(useToasts.getState().toasts.at(-1)?.message).toBe('Unavailable offline');
});

it('online: quick-add (+) tile fires the mutation (no regression)', async () => {
  // Online — default beforeEach already sets online via the global setup.
  // Press the + badge (discover-quickadd-*) which calls onAddTile → mutation.
  // The outer cover tile (discover-add-*) opens the detail sheet instead.
  mockBrowse.mockReturnValue({
    data: {
      rows: [{ id: 'r1', label: 'Popular', meta: '', items: [
        { title: 'Berserk', contentType: 'manga', author: 'Miura', coverUrl: null, detail: null, inLib: false, sourceId: 'src-1', year: 1989 },
      ] }],
    },
    isLoading: false, isError: false, refetch: jest.fn(),
  });
  renderDiscover();
  await waitFor(() => expect(screen.getByTestId('discover-quickadd-src-1')).toBeTruthy());
  fireEvent.press(screen.getByTestId('discover-quickadd-src-1'));
  expect(mockAddMutate).toHaveBeenCalledTimes(1);
});
