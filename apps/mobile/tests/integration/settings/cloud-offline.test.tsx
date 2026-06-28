import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { useConnectivity } from '@/state/connectivityStore';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return { ...actual, useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }) };
});

const mockCloudQ = jest.fn();
const mockDisconnect = jest.fn();

jest.mock('@/api/hooks', () => ({
  useMe: () => ({ data: { role: 'admin' } }),
  useCloudSettings: () => mockCloudQ(),
  useCloudDisconnect: () => ({ mutateAsync: mockDisconnect, isPending: false }),
}));

import Cloud from '@/screens/settings/Cloud';

function setOffline() {
  useConnectivity.setState({ deviceOnline: false, serverReachable: false });
}

const CONNECTED = {
  config: {
    enabled: true,
    installUuid: 'u',
    cloudBaseUrl: 'c',
    tenantId: null,
    acceptedEulaVersion: null,
    acceptedPrivacyVersion: null,
    acceptedAt: null,
    lastRegisterError: null,
  },
};

beforeEach(() => {
  mockDisconnect.mockClear();
  mockCloudQ.mockReturnValue({ data: undefined, isLoading: true, isError: false });
});

it('offline + no data: shows the offline state, not the Loading… spinner', async () => {
  setOffline();
  render(
    <ThemeProvider>
      <Cloud />
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('settings-offline-state')).toBeTruthy());
  expect(screen.queryByText('Loading…')).toBeNull();
});

it('offline + cached connected data: Disconnect is disabled and gated', async () => {
  setOffline();
  mockCloudQ.mockReturnValue({ data: CONNECTED, isLoading: false, isError: false });
  render(
    <ThemeProvider>
      <Cloud />
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('cloud-disconnect')).toBeTruthy());
  expect(screen.queryByTestId('settings-offline-state')).toBeNull();
  const btn = screen.getByTestId('cloud-disconnect');
  // Disabled (greyed) AND gated: a disabled Pressable swallows the press, so the
  // disconnect mutation never fires.
  expect(btn.props.accessibilityState?.disabled).toBe(true);
  fireEvent.press(btn);
  expect(mockDisconnect).not.toHaveBeenCalled();
});

it('online + connected data: Disconnect arms confirm then fires (no regression)', async () => {
  mockDisconnect.mockResolvedValue({ devicesRemoved: 0 });
  mockCloudQ.mockReturnValue({ data: CONNECTED, isLoading: false, isError: false });
  render(
    <ThemeProvider>
      <Cloud />
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('cloud-disconnect')).toBeTruthy());
  // First press arms the confirm; second press fires the mutation.
  fireEvent.press(screen.getByTestId('cloud-disconnect'));
  await waitFor(() => expect(screen.getByText('Tap again to confirm disconnect')).toBeTruthy());
  fireEvent.press(screen.getByTestId('cloud-disconnect'));
  await waitFor(() => expect(mockDisconnect).toHaveBeenCalledTimes(1));
});
