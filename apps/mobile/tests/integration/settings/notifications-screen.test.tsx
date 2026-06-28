import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Notifications from '@/screens/settings/Notifications';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/auth/AuthContext';
import { server } from '../../mocks/server';
import { http, HttpResponse } from 'msw';

jest.mock('@/auth/token-store', () => ({
  tokenStore: {
    load: jest.fn().mockResolvedValue({
      serverUrl: 'https://srv',
      token: 't',
      refreshToken: 'r',
      expiresAt: '2999-01-01T00:00:00Z',
      certFingerprint: null,
    }),
    save: jest.fn(),
    clear: jest.fn(),
  },
}));

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      navigate: jest.fn(),
      goBack: mockGoBack,
      reset: jest.fn(),
      replace: jest.fn(),
      push: jest.fn(),
      pop: jest.fn(),
      setOptions: jest.fn(),
      setParams: jest.fn(),
      getParent: jest.fn(() => ({ navigate: jest.fn(), goBack: jest.fn(), reset: jest.fn() })),
      addListener: jest.fn(() => () => undefined),
      removeListener: jest.fn(),
      isFocused: () => true,
    }),
    useRoute: () => ({ params: {}, key: 'mock-route', name: 'MockRoute' }),
    useFocusEffect: (cb: () => void | (() => void)) => {
      cb();
    },
    useNavigationState: () => undefined,
    useIsFocused: () => true,
  };
});

const adminMe = () =>
  http.get('https://srv/api/mobile/me', () =>
    HttpResponse.json({ id: 1, username: 'admin', email: null, displayName: null, role: 'admin' }),
  );

const MASK = '••••••••';

const notifGet = (
  overrides: Partial<{
    discordWebhookUrl: string | null;
    discordWebhookConfigured: boolean;
    discordUsername: string;
    discordAvatarUrl: string | null;
    appriseUrl: string | null;
    appriseConfigured: boolean;
    eventGrabSuccess: boolean;
    eventImportSuccess: boolean;
    eventFailure: boolean;
    eventUpdateAvailable: boolean;
  }> = {},
) =>
  http.get('https://srv/api/settings/notifications', () =>
    HttpResponse.json({
      discordWebhookUrl: MASK,
      discordWebhookConfigured: true,
      discordUsername: 'bookkeeprr',
      discordAvatarUrl: null,
      appriseUrl: MASK,
      appriseConfigured: true,
      eventGrabSuccess: true,
      eventImportSuccess: true,
      eventFailure: true,
      eventUpdateAvailable: true,
      ...overrides,
    }),
  );

function renderScreen() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <Notifications />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

it('renders the screen for an admin', async () => {
  server.use(adminMe(), notifGet());

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('screen-notifications')).toBeTruthy());
  await waitFor(() => expect(screen.getByTestId('notif-discord-url')).toBeTruthy());
  expect(screen.getByTestId('notif-apprise-url')).toBeTruthy();
});

it('toggling eventGrabSuccess off + Save PATCHes the body preserving eventUpdateAvailable, with no push* keys and webhook/apprise "" (keep)', async () => {
  let patchBody: Record<string, unknown> | null = null;
  server.use(
    adminMe(),
    notifGet({ eventUpdateAvailable: true }),
    http.patch('https://srv/api/settings/notifications', async ({ request }) => {
      patchBody = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ ok: true });
    }),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('notif-evt-grab')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByTestId('notif-evt-grab'));
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId('notif-save'));
  });

  await waitFor(() => expect(patchBody).not.toBeNull());

  // Toggled off.
  expect(patchBody).toMatchObject({
    eventGrabSuccess: false,
    eventImportSuccess: true,
    eventFailure: true,
    // Preserved from GET (not exposed in the form, but echoed back).
    eventUpdateAvailable: true,
    // Secret fields untouched → blank → keep stored.
    discordWebhookUrl: '',
    appriseUrl: '',
    discordUsername: 'bookkeeprr',
    discordAvatarUrl: null,
  });

  // CRITICAL: never send any push* field.
  const sent = patchBody as unknown as Record<string, unknown>;
  expect(sent).not.toHaveProperty('pushEnabled');
  expect(sent).not.toHaveProperty('pushDevices');
  for (const key of Object.keys(sent)) {
    expect(key.startsWith('push')).toBe(false);
  }
});

it('Send test renders discord + apprise results (ok / not-configured / error)', async () => {
  server.use(
    adminMe(),
    notifGet(),
    http.post('https://srv/api/settings/notifications/test', () =>
      HttpResponse.json({
        discord: 'ok',
        apprise: { error: 'apprise: connection refused' },
      }),
    ),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('notif-test')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByTestId('notif-test'));
  });

  await waitFor(() => expect(screen.getByTestId('notif-result')).toBeTruthy());
  // Both channels reported.
  expect(screen.getByTestId('notif-result-discord')).toBeTruthy();
  expect(screen.getByTestId('notif-result-apprise')).toBeTruthy();
  // The apprise error message surfaces.
  expect(screen.getByText(/connection refused/)).toBeTruthy();
});

it('Send test renders a not-configured channel result', async () => {
  server.use(
    adminMe(),
    notifGet(),
    http.post('https://srv/api/settings/notifications/test', () =>
      HttpResponse.json({
        discord: 'not-configured',
        apprise: 'ok',
      }),
    ),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('notif-test')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByTestId('notif-test'));
  });

  await waitFor(() => expect(screen.getByTestId('notif-result-discord')).toBeTruthy());
  expect(screen.getByText(/not configured/i)).toBeTruthy();
});
