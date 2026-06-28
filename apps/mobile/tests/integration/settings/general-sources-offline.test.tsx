import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { useConnectivity } from '@/state/connectivityStore';
import { useToasts } from '@/state/toastStore';

// SP4 Task-4 sweep (batch 1): representative offline-branch + gated-write coverage
// for the General + Sources server-class settings screens. The gating pattern is
// identical across the batch (proven in Task 4a); these guard a sample.

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return { ...actual, useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }) };
});

// ── AutoGrab hooks ──
const mockAutoGrabQ = jest.fn();
const mockAutoGrabSave = jest.fn();
// ── qBittorrent hooks ──
const mockQbtQ = jest.fn();
const mockQbtSave = jest.fn();
const mockQbtTest = jest.fn();
// ── API-key (metadata) hooks ──
const mockKeyQ = jest.fn();
const mockKeySave = jest.fn();
const mockKeyTest = jest.fn();

jest.mock('@/api/hooks', () => ({
  useMe: () => ({ data: { role: 'admin' } }),
  useAutoGrab: () => mockAutoGrabQ(),
  useSaveAutoGrab: () => ({ mutate: mockAutoGrabSave, isPending: false, isError: false }),
  useQbt: () => mockQbtQ(),
  useSaveQbt: () => ({ mutate: mockQbtSave, isPending: false, isError: false }),
  useTestQbt: () => ({ mutate: mockQbtTest, isPending: false }),
  useKeySetting: () => mockKeyQ(),
  useSaveKeySetting: () => ({ mutateAsync: mockKeySave, isPending: false }),
  useTestKey: () => ({ mutate: mockKeyTest, isPending: false, data: undefined }),
}));

import AutoGrab from '@/screens/settings/AutoGrab';
import QBittorrent from '@/screens/settings/QBittorrent';
import ComicVine from '@/screens/settings/ComicVine';

function setOffline() {
  useConnectivity.setState({ deviceOnline: false, serverReachable: false });
}

const QBT_CONFIG = {
  host: 'h',
  port: 8080,
  username: 'u',
  password: '****',
  useHttps: false,
};

beforeEach(() => {
  mockAutoGrabSave.mockClear();
  mockQbtSave.mockClear();
  mockQbtTest.mockClear();
  mockKeySave.mockClear();
  mockKeyTest.mockClear();
  useToasts.setState({ toasts: [] });
  // Default: paused query offline → no data.
  mockAutoGrabQ.mockReturnValue({ data: undefined, isLoading: true, isError: false });
  mockQbtQ.mockReturnValue({ data: undefined, isLoading: true, isError: false });
  mockKeyQ.mockReturnValue({ data: undefined, isLoading: true, isError: false });
});

describe('AutoGrab', () => {
  it('offline + no data: shows the offline state, not the Loading… spinner', async () => {
    setOffline();
    render(
      <ThemeProvider>
        <AutoGrab />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('settings-offline-state')).toBeTruthy());
    expect(screen.queryByText('Loading…')).toBeNull();
  });

  it('offline + cached data: Save is disabled and gated (mutation never fires)', async () => {
    setOffline();
    mockAutoGrabQ.mockReturnValue({ data: { dryRun: true }, isLoading: false, isError: false });
    render(
      <ThemeProvider>
        <AutoGrab />
      </ThemeProvider>,
    );
    // The toggle flips local draft → makes the form dirty so Save would be
    // enabled if it weren't for the offline guard.
    await waitFor(() => expect(screen.getByTestId('autograb-dryrun')).toBeTruthy());
    fireEvent(screen.getByTestId('autograb-dryrun'), 'press');
    const save = screen.getByTestId('autograb-save');
    expect(save.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(save);
    expect(mockAutoGrabSave).not.toHaveBeenCalled();
  });

  it('online + data: Save fires the mutation (no regression)', async () => {
    mockAutoGrabQ.mockReturnValue({ data: { dryRun: true }, isLoading: false, isError: false });
    render(
      <ThemeProvider>
        <AutoGrab />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('autograb-dryrun')).toBeTruthy());
    fireEvent.press(screen.getByTestId('autograb-dryrun')); // flip draft → dirty
    // Wait for the re-render so Save is enabled before pressing it.
    await waitFor(() =>
      expect(screen.getByTestId('autograb-save').props.accessibilityState?.disabled).toBe(false),
    );
    fireEvent.press(screen.getByTestId('autograb-save'));
    expect(mockAutoGrabSave).toHaveBeenCalledTimes(1);
  });
});

describe('qBittorrent', () => {
  it('offline + no data: shows the offline state', async () => {
    setOffline();
    render(
      <ThemeProvider>
        <QBittorrent />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('settings-offline-state')).toBeTruthy());
    expect(screen.queryByText('Loading…')).toBeNull();
  });

  it('offline + cached data: Test is disabled and gated (mutation never fires)', async () => {
    setOffline();
    mockQbtQ.mockReturnValue({ data: QBT_CONFIG, isLoading: false, isError: false });
    render(
      <ThemeProvider>
        <QBittorrent />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('qbt-test')).toBeTruthy());
    expect(screen.queryByTestId('settings-offline-state')).toBeNull();
    const test = screen.getByTestId('qbt-test');
    expect(test.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(test);
    expect(mockQbtTest).not.toHaveBeenCalled();
  });

  it('online + data: Test fires the mutation (no regression)', async () => {
    mockQbtQ.mockReturnValue({ data: QBT_CONFIG, isLoading: false, isError: false });
    render(
      <ThemeProvider>
        <QBittorrent />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('qbt-test')).toBeTruthy());
    fireEvent.press(screen.getByTestId('qbt-test'));
    expect(mockQbtTest).toHaveBeenCalledTimes(1);
  });
});

describe('Metadata (ApiKeySettingScreen via ComicVine)', () => {
  it('offline + no data: shows the offline state', async () => {
    setOffline();
    render(
      <ThemeProvider>
        <ComicVine />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('settings-offline-state')).toBeTruthy());
    expect(screen.queryByText('Loading…')).toBeNull();
  });

  it('offline + cached data: Test is disabled and gated (mutation never fires)', async () => {
    setOffline();
    mockKeyQ.mockReturnValue({ data: { apiKey: '****' }, isLoading: false, isError: false });
    render(
      <ThemeProvider>
        <ComicVine />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('apikey-test')).toBeTruthy());
    expect(screen.queryByTestId('settings-offline-state')).toBeNull();
    const test = screen.getByTestId('apikey-test');
    expect(test.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(test);
    expect(mockKeyTest).not.toHaveBeenCalled();
  });

  it('online + data: Test fires the mutation (no regression)', async () => {
    mockKeyQ.mockReturnValue({ data: { apiKey: '****' }, isLoading: false, isError: false });
    render(
      <ThemeProvider>
        <ComicVine />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('apikey-test')).toBeTruthy());
    fireEvent.press(screen.getByTestId('apikey-test'));
    expect(mockKeyTest).toHaveBeenCalledTimes(1);
  });
});
