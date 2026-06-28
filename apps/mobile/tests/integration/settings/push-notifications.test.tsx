import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PushNotifications } from '@/screens/settings/PushNotifications';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/auth/AuthContext';
import { server } from '../../mocks/server';
import { __resetFirebaseMessaging, __setPermissionStatus } from '../../mocks/firebase-messaging';

jest.mock('@/auth/token-store', () => ({
  tokenStore: {
    load: jest.fn().mockResolvedValue({
      serverUrl: 'https://srv',
      token: 'bearer-tok',
      refreshToken: 'r',
      expiresAt: '2026-08-25T00:00:00Z',
      certFingerprint: null,
    }),
    save: jest.fn(),
    clear: jest.fn(),
  },
}));

function Wrapped({ pushEnabled }: { pushEnabled: boolean }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <PushNotifications serverPushEnabled={pushEnabled} />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

beforeEach(async () => {
  await AsyncStorage.clear();
  __resetFirebaseMessaging();
});

describe('PushNotifications screen', () => {
  it('shows disabled-server state when push_enabled=false', async () => {
    await render(<Wrapped pushEnabled={false} />);
    await waitFor(() => expect(screen.getByTestId('push-disabled-server')).toBeTruthy());
  });

  it('shows enable button when push_enabled=true and user not opted in', async () => {
    await render(<Wrapped pushEnabled={true} />);
    await waitFor(() => expect(screen.getByTestId('btn-push-enable')).toBeTruthy());
    expect(screen.getByTestId('push-state-off')).toBeTruthy();
  });

  it('moves to the on state after a successful enable', async () => {
    server.use(
      http.post('https://srv/api/mobile/push/register', () =>
        HttpResponse.json({ id: 'srv-1', registered_at: '2026-05-26T00:00:00Z' }, { status: 201 }),
      ),
    );
    await render(<Wrapped pushEnabled={true} />);
    const btn = await screen.findByTestId('btn-push-enable');
    await act(async () => {
      await fireEvent.press(btn);
    });
    await waitFor(() => expect(screen.getByTestId('push-state-on')).toBeTruthy());
    expect(screen.getByTestId('btn-push-disable')).toBeTruthy();
  });

  it('shows server_error UI on register failure', async () => {
    server.use(
      http.post(
        'https://srv/api/mobile/push/register',
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    await render(<Wrapped pushEnabled={true} />);
    const btn = await screen.findByTestId('btn-push-enable');
    await act(async () => {
      await fireEvent.press(btn);
    });
    await waitFor(() => expect(screen.getByTestId('push-error')).toBeTruthy());
    expect(screen.getByText(/registration failed/i)).toBeTruthy();
  });

  it('shows permission_denied UI when user denies', async () => {
    __setPermissionStatus('DENIED');
    await render(<Wrapped pushEnabled={true} />);
    const btn = await screen.findByTestId('btn-push-enable');
    await act(async () => {
      await fireEvent.press(btn);
    });
    await waitFor(() => expect(screen.getByTestId('push-error')).toBeTruthy());
    expect(screen.getByText(/permission/i)).toBeTruthy();
  });

  it('returns to the off state after disable', async () => {
    server.use(
      http.post('https://srv/api/mobile/push/register', () =>
        HttpResponse.json({ id: 'srv-1' }, { status: 201 }),
      ),
    );
    await render(<Wrapped pushEnabled={true} />);
    const enableBtn = await screen.findByTestId('btn-push-enable');
    await act(async () => {
      await fireEvent.press(enableBtn);
    });
    const disableBtn = await screen.findByTestId('btn-push-disable');
    await act(async () => {
      await fireEvent.press(disableBtn);
    });
    await waitFor(() => expect(screen.getByTestId('push-state-off')).toBeTruthy());
  });
});
