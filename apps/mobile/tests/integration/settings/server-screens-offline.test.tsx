import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { useConnectivity } from '@/state/connectivityStore';
import { useToasts } from '@/state/toastStore';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return { ...actual, useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }) };
});

// ── Updates hooks ──
const mockUpdatesQ = jest.fn();
const mockUpdateMutate = jest.fn();
const mockCheckMutate = jest.fn();
const mockSetModeMutate = jest.fn();
// ── Indexers hooks ──
const mockIndexersQ = jest.fn();
const mockIndexerUpdateMutate = jest.fn();
const mockIndexerDeleteMutate = jest.fn();

jest.mock('@/api/hooks', () => ({
  useMe: () => ({ data: { role: 'admin' } }),
  useUpdatesSettings: () => mockUpdatesQ(),
  useUpdateUpdatesSettings: () => ({ mutate: mockUpdateMutate, isPending: false, isError: false }),
  useCheckUpdates: () => ({ mutate: mockCheckMutate, isPending: false, data: undefined }),
  useSetDeploymentMode: () => ({ mutate: mockSetModeMutate, isError: false }),
  useIndexers: () => mockIndexersQ(),
  useUpdateIndexer: () => ({ mutate: mockIndexerUpdateMutate, isPending: false }),
  useDeleteIndexer: () => ({ mutate: mockIndexerDeleteMutate, isPending: false }),
}));

// ProwlarrCard fires its own queries on mount — stub it so no real request flips
// connectivity mid-test (the SP1 passive-reachability trap).
jest.mock('@/features/settings/indexers/ProwlarrCard', () => ({ ProwlarrCard: () => null }));

import Updates from '@/screens/settings/Updates';
import Indexers from '@/screens/settings/Indexers';

function setOffline() {
  useConnectivity.setState({ deviceOnline: false, serverReachable: false });
}

const CONFIG = {
  config: {
    frequency: 'daily',
    behavior: 'notify',
    notifyOnIntegrations: true,
    showChangelogOnFirstLaunch: true,
  },
  deploymentMode: 'auto',
  buildInfo: { version: '1.2.3', commit: 'abc', builtAt: 't', runtime: 'node' },
  updateAvailable: false,
};

const INDEXERS = {
  indexers: [
    { id: 1, name: 'Nyaa', kind: 'torznab', baseUrl: 'https://nyaa', enabled: true, lastRssAt: null },
  ],
};

beforeEach(() => {
  mockUpdateMutate.mockClear();
  mockCheckMutate.mockClear();
  mockSetModeMutate.mockClear();
  mockIndexerUpdateMutate.mockClear();
  mockIndexerDeleteMutate.mockClear();
  useToasts.setState({ toasts: [] });
  // Default: paused query offline → no data.
  mockUpdatesQ.mockReturnValue({ data: undefined, isLoading: true, isError: false });
  mockIndexersQ.mockReturnValue({ data: undefined, isLoading: true, isError: false });
});

describe('Updates', () => {
  it('offline + no data: shows the offline state, not the Loading… spinner', async () => {
    setOffline();
    render(
      <ThemeProvider>
        <Updates />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('settings-offline-state')).toBeTruthy());
    expect(screen.queryByText('Loading…')).toBeNull();
  });

  it('offline + cached data: form renders but Check is disabled and gated', async () => {
    setOffline();
    mockUpdatesQ.mockReturnValue({ data: CONFIG, isLoading: false, isError: false });
    render(
      <ThemeProvider>
        <Updates />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('updates-check-now')).toBeTruthy());
    // Offline state NOT shown (we have cached data).
    expect(screen.queryByTestId('settings-offline-state')).toBeNull();
    const check = screen.getByTestId('updates-check-now');
    // Disabled (the button is greyed) AND gated (the handler no-ops): a disabled
    // Pressable swallows the press, so the mutation never fires either way.
    expect(check.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(check);
    expect(mockCheckMutate).not.toHaveBeenCalled();
  });

  it('online + data: Check fires the mutation (no regression)', async () => {
    mockUpdatesQ.mockReturnValue({ data: CONFIG, isLoading: false, isError: false });
    render(
      <ThemeProvider>
        <Updates />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('updates-check-now')).toBeTruthy());
    fireEvent.press(screen.getByTestId('updates-check-now'));
    expect(mockCheckMutate).toHaveBeenCalledTimes(1);
  });
});

describe('Indexers', () => {
  it('offline + no data: shows the offline state, not the Loading… spinner', async () => {
    setOffline();
    render(
      <ThemeProvider>
        <Indexers />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('settings-offline-state')).toBeTruthy());
    expect(screen.queryByText('Loading…')).toBeNull();
  });

  it('offline + cached data: rows render but the enable toggle is gated', async () => {
    setOffline();
    mockIndexersQ.mockReturnValue({ data: INDEXERS, isLoading: false, isError: false });
    render(
      <ThemeProvider>
        <Indexers />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('indexer-enabled-1')).toBeTruthy());
    expect(screen.queryByTestId('settings-offline-state')).toBeNull();
    fireEvent(screen.getByTestId('indexer-enabled-1'), 'press');
    expect(mockIndexerUpdateMutate).not.toHaveBeenCalled();
    expect(useToasts.getState().toasts.at(-1)?.message).toBe('Unavailable offline');
  });

  it('online + data: toggling an indexer fires the mutation (no regression)', async () => {
    mockIndexersQ.mockReturnValue({ data: INDEXERS, isLoading: false, isError: false });
    render(
      <ThemeProvider>
        <Indexers />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('indexer-enabled-1')).toBeTruthy());
    fireEvent(screen.getByTestId('indexer-enabled-1'), 'press');
    expect(mockIndexerUpdateMutate).toHaveBeenCalledTimes(1);
  });
});
