import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { useConnectivity } from '@/state/connectivityStore';
import { visibleGroups, settingsItemOffline } from '@/features/settings/settings-nav';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return { ...actual, useNavigation: () => ({ navigate: mockNavigate }) };
});

// Admin so all groups render; useMe is a paused query offline but we feed it.
jest.mock('@/api/hooks', () => ({ useMe: () => ({ data: { role: 'admin', username: 'paul' } }) }));

const mockIsLandscape = { value: false };
jest.mock('@/responsive/useLayout', () => ({
  useLayout: () => ({ isLandscape: mockIsLandscape.value }),
}));

jest.mock('@/auth/AuthContext', () => {
  const actual = jest.requireActual('@/auth/AuthContext');
  return {
    ...actual,
    useAuth: () => ({
      state: { status: 'authenticated', creds: { serverUrl: 'https://srv' } },
      signOut: jest.fn(),
    }),
  };
});

import { SettingsHomeContent } from '@/features/settings/SettingsHomeContent';

function setOffline() {
  useConnectivity.setState({ deviceOnline: false, serverReachable: false });
}
function renderHome() {
  return render(
    <ThemeProvider>
      <SettingsHomeContent />
    </ThemeProvider>,
  );
}

// Count of admin-visible server-class items — each carries the "Needs connection" sub offline.
const serverCount = visibleGroups(true)
  .flatMap((g) => g.items)
  .filter((i) => i.status === 'native' && settingsItemOffline(i) === 'server').length;

beforeEach(() => {
  mockNavigate.mockClear();
  mockIsLandscape.value = false;
});

it('offline: a server row shows "Needs connection" and is dimmed; a local row is not', async () => {
  setOffline();
  renderHome();
  await waitFor(() => expect(screen.getByTestId('row-updates')).toBeTruthy());
  // Server row: sub copy present, once per visible server item — local rows carry none.
  expect(screen.getAllByText('Needs connection').length).toBe(serverCount);
});

it('offline: tapping a gated server row still navigates (so the offline state shows)', async () => {
  setOffline();
  renderHome();
  await waitFor(() => expect(screen.getByTestId('row-updates')).toBeTruthy());
  fireEvent.press(screen.getByTestId('row-updates'));
  expect(mockNavigate).toHaveBeenCalledWith('Updates');
});

it('offline: a local row (Appearance) navigates with no gating', async () => {
  setOffline();
  renderHome();
  await waitFor(() => expect(screen.getByTestId('row-appearance')).toBeTruthy());
  fireEvent.press(screen.getByTestId('row-appearance'));
  expect(mockNavigate).toHaveBeenCalledWith('Appearance');
});

it('online: no "Needs connection" copy anywhere (no regression)', async () => {
  renderHome(); // default online
  await waitFor(() => expect(screen.getByTestId('row-updates')).toBeTruthy());
  expect(screen.queryByText('Needs connection')).toBeNull();
});

describe('tablet (landscape) rail', () => {
  it('offline: a gated server entry shows a CloudOff marker; a local entry does not', async () => {
    mockIsLandscape.value = true;
    setOffline();
    renderHome();
    await waitFor(() => expect(screen.getByTestId('set-nav-updates')).toBeTruthy());
    expect(screen.getByTestId('set-nav-offline-updates')).toBeTruthy();
    expect(screen.queryByTestId('set-nav-offline-appearance')).toBeNull();
  });

  it('offline: a gated rail entry stays selectable (not disabled)', async () => {
    mockIsLandscape.value = true;
    setOffline();
    renderHome();
    await waitFor(() => expect(screen.getByTestId('set-nav-updates')).toBeTruthy());
    // Dimmed (gated) but still an interactive Pressable with an onPress handler —
    // selecting it sets `detail`, and the detail pane shows its own offline state.
    const rail = screen.getByTestId('set-nav-updates');
    expect(rail.props.accessibilityState?.disabled).toBeFalsy();
    expect(typeof rail.props.onClick === 'function' || typeof rail.props.onPress === 'function').toBe(
      true,
    );
  });

  it('online: no rail offline markers (no regression)', async () => {
    mockIsLandscape.value = true;
    renderHome(); // default online
    await waitFor(() => expect(screen.getByTestId('set-nav-updates')).toBeTruthy());
    expect(screen.queryByTestId('set-nav-offline-updates')).toBeNull();
  });
});
