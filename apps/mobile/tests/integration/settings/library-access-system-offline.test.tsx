// SP4 Task-4 sweep, batch 2: offline-gating for the Library / Access / System /
// App settings screens. Mirrors the proven harness from server-screens-offline:
// the on-mount data hooks are mocked (so no real request flips connectivity via
// the SP1 passive-reachability trap), connectivity is driven through the plain
// `useConnectivity.setState`, and the global setup defaults online. State-mutating
// interactions are wrapped in `act` so React flushes before assertions.

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { useConnectivity } from '@/state/connectivityStore';
import { useToasts } from '@/state/toastStore';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return { ...actual, useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }) };
});

// UsersList reads useAuth (for the Gravatar identity); mock it so the online
// Users case renders without an AuthProvider wrapper.
jest.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ state: { status: 'authenticated', creds: { serverUrl: 'https://srv', token: 't' } } }),
}));

// ── Storage hooks ──
const mockStorageQ = jest.fn();
const mockStorageSave = jest.fn();
// ── Discover hooks ──
const mockDiscoverQ = jest.fn();
const mockDiscoverSave = jest.fn();
// ── Users hooks ──
const mockUsersQ = jest.fn();
// ── CreateUser hook ──
const mockCreateUserAsync = jest.fn().mockResolvedValue(undefined);

jest.mock('@/api/hooks', () => ({
  useMe: () => ({ data: { role: 'admin' } }),
  useStorage: () => mockStorageQ(),
  useSaveStorage: () => ({ mutate: mockStorageSave, isPending: false, isError: false }),
  useDiscover: () => mockDiscoverQ(),
  useSaveDiscover: () => ({ mutate: mockDiscoverSave, isPending: false, isError: false }),
  useUsers: () => mockUsersQ(),
  useUpdateUser: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useDeleteUser: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useCreateUser: () => ({ mutateAsync: mockCreateUserAsync, isPending: false }),
}));

import Storage from '@/screens/settings/Storage';
import Discover from '@/screens/settings/Discover';
import Users from '@/screens/settings/Users';
import CreateUser from '@/screens/settings/CreateUser';

function setOffline() {
  useConnectivity.setState({ deviceOnline: false, serverReachable: false });
}

const STORAGE = {
  contentTypePaths: {
    manga: { libraryRoot: '/m', qbtCategory: 'm' },
    comic: { libraryRoot: '', qbtCategory: '' },
    light_novel: { libraryRoot: '', qbtCategory: '' },
    ebook: { libraryRoot: '', qbtCategory: '' },
    audiobook: { libraryRoot: '', qbtCategory: '' },
  },
  torrentCleanup: { mode: 'never', deleteFiles: false },
  imageCache: { enabled: false, dir: '' },
};

const DISCOVER = { trendingSource: 'anilist' };

beforeEach(() => {
  mockStorageSave.mockClear();
  mockDiscoverSave.mockClear();
  mockCreateUserAsync.mockClear();
  useToasts.setState({ toasts: [] });
  mockStorageQ.mockReturnValue({ data: undefined, isLoading: true, isError: false });
  mockDiscoverQ.mockReturnValue({ data: undefined, isLoading: true, isError: false });
  mockUsersQ.mockReturnValue({ data: undefined, isLoading: true, isError: false });
});

describe('Storage', () => {
  it('offline + no data: shows the offline state, not the Loading… spinner', async () => {
    setOffline();
    render(
      <ThemeProvider>
        <Storage />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('settings-offline-state')).toBeTruthy());
    expect(screen.queryByText('Loading…')).toBeNull();
  });

  it('offline + cached data: form renders but Save is disabled and gated', async () => {
    setOffline();
    mockStorageQ.mockReturnValue({ data: STORAGE, isLoading: false, isError: false });
    render(
      <ThemeProvider>
        <Storage />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('storage-delete-files')).toBeTruthy());
    // Dirty the form so the only thing keeping Save disabled is the offline gate.
    await act(async () => {
      fireEvent.press(screen.getByTestId('storage-delete-files'));
    });
    const save = screen.getByTestId('storage-save');
    expect(save.props.accessibilityState?.disabled).toBe(true);
    await act(async () => {
      fireEvent.press(save);
    });
    expect(mockStorageSave).not.toHaveBeenCalled();
  });

  it('online + data: Save fires the mutation (no regression)', async () => {
    mockStorageQ.mockReturnValue({ data: STORAGE, isLoading: false, isError: false });
    render(
      <ThemeProvider>
        <Storage />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('storage-delete-files')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByTestId('storage-delete-files'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('storage-save'));
    });
    expect(mockStorageSave).toHaveBeenCalledTimes(1);
  });
});

describe('Discover', () => {
  it('offline + no data: shows the offline state, not the Loading… spinner', async () => {
    setOffline();
    render(
      <ThemeProvider>
        <Discover />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('settings-offline-state')).toBeTruthy());
    expect(screen.queryByText('Loading…')).toBeNull();
  });

  it('online + data: changing the source then Save fires the mutation', async () => {
    mockDiscoverQ.mockReturnValue({ data: DISCOVER, isLoading: false, isError: false });
    render(
      <ThemeProvider>
        <Discover />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('discover-src-mal')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByTestId('discover-src-mal'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('discover-save'));
    });
    expect(mockDiscoverSave).toHaveBeenCalledTimes(1);
  });
});

describe('Users', () => {
  it('offline + no data: shows the offline state, not the Loading… spinner', async () => {
    setOffline();
    render(
      <ThemeProvider>
        <Users />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('settings-offline-state')).toBeTruthy());
    expect(screen.queryByText('Loading…')).toBeNull();
  });

  it('online + data: the users list renders (no offline state)', async () => {
    // Empty list keeps the row renderer (which reads several UserRow fields) out
    // of the test surface; we only need the Add-user CTA + absence of offline.
    mockUsersQ.mockReturnValue({ data: { users: [] }, isLoading: false, isError: false });
    render(
      <ThemeProvider>
        <Users />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('btn-add-user')).toBeTruthy());
    expect(screen.queryByTestId('settings-offline-state')).toBeNull();
  });
});

describe('CreateUser (pushed form)', () => {
  it('offline: submit is disabled and gated — the create mutation never fires', async () => {
    setOffline();
    render(
      <ThemeProvider>
        <CreateUser />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('cu-username')).toBeTruthy());
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('cu-username'), 'newbie');
      fireEvent.changeText(screen.getByTestId('cu-password'), 'longenough1');
    });
    const submit = screen.getByTestId('cu-submit');
    expect(submit.props.accessibilityState?.disabled).toBe(true);
    await act(async () => {
      fireEvent.press(submit);
    });
    expect(mockCreateUserAsync).not.toHaveBeenCalled();
  });

  it('online: submit fires the create mutation (no regression)', async () => {
    render(
      <ThemeProvider>
        <CreateUser />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('cu-username')).toBeTruthy());
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('cu-username'), 'newbie');
      fireEvent.changeText(screen.getByTestId('cu-password'), 'longenough1');
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('cu-submit'));
    });
    await waitFor(() => expect(mockCreateUserAsync).toHaveBeenCalledTimes(1));
  });
});
