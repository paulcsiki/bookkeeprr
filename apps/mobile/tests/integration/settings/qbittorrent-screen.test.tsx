import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import QBittorrent from '@/screens/settings/QBittorrent';
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
    useFocusEffect: (cb: () => void | (() => void)) => { cb(); },
    useNavigationState: () => undefined,
    useIsFocused: () => true,
  };
});

const adminMe = () =>
  http.get('https://srv/api/mobile/me', () =>
    HttpResponse.json({ id: 1, username: 'admin', email: null, displayName: null, role: 'admin' }),
  );

const qbtGet = (overrides: Partial<{ host: string; port: number; username: string; password: string; useHttps: boolean }> = {}) =>
  http.get('https://srv/api/settings/qbt', () =>
    HttpResponse.json({
      host: 'h',
      port: 8080,
      username: 'admin',
      password: '****',
      useHttps: false,
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
          <QBittorrent />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

it('seeds fields from GET and shows "Password is set" indicator', async () => {
  server.use(adminMe(), qbtGet());

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('screen-qbittorrent')).toBeTruthy());
  await waitFor(() => expect(screen.getByTestId('qbt-host')).toBeTruthy());

  // Host and port seed from GET.
  expect(screen.getByTestId('qbt-host').props.value).toBe('h');
  expect(screen.getByTestId('qbt-port').props.value).toBe('8080');
  expect(screen.getByTestId('qbt-username').props.value).toBe('admin');
  // Password field starts empty (secure), not '****'.
  expect(screen.getByTestId('qbt-password').props.value).toBe('');

  // "Password is set" indicator shows because GET returned '****'.
  expect(screen.getByText(/Password is set/i)).toBeTruthy();
});

it('editing host + Save PUTs the body with password:""(blank = keep stored)', async () => {
  let putBody: Record<string, unknown> | null = null;
  server.use(
    adminMe(),
    qbtGet(),
    http.put('https://srv/api/settings/qbt', async ({ request }) => {
      putBody = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ ok: true });
    }),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('qbt-host')).toBeTruthy());

  await act(async () => {
    fireEvent.changeText(screen.getByTestId('qbt-host'), 'newhost');
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId('qbt-save'));
  });

  await waitFor(() => expect(putBody).not.toBeNull());
  // Password untouched → blank → keep stored.
  expect(putBody).toEqual({
    host: 'newhost',
    port: 8080,
    username: 'admin',
    password: '',
    useHttps: false,
  });
});

it('Test button POSTs current field values and shows ok result', async () => {
  server.use(
    adminMe(),
    qbtGet(),
    http.post('https://srv/api/qbt/test-connection', () =>
      HttpResponse.json({ ok: true }),
    ),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('qbt-test')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByTestId('qbt-test'));
  });

  await waitFor(() => expect(screen.getByTestId('qbt-test-result')).toBeTruthy());
});

it('Test button shows error result when POST /api/qbt/test-connection returns non-2xx {ok:false}', async () => {
  server.use(
    adminMe(),
    qbtGet(),
    http.post('https://srv/api/qbt/test-connection', () =>
      HttpResponse.json({ ok: false, error: 'Connection refused' }, { status: 502 }),
    ),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('qbt-test')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByTestId('qbt-test'));
  });

  // Must RESOLVE (not throw/blank) and show the error in qbt-test-result.
  await waitFor(() => expect(screen.getByTestId('qbt-test-result')).toBeTruthy());
  expect(screen.getByText(/Connection refused/i)).toBeTruthy();
});

it('out-of-range port (70000) blocks Save', async () => {
  let putCalled = false;
  server.use(
    adminMe(),
    qbtGet(),
    http.put('https://srv/api/settings/qbt', () => {
      putCalled = true;
      return HttpResponse.json({ ok: true });
    }),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('qbt-port')).toBeTruthy());

  await act(async () => {
    fireEvent.changeText(screen.getByTestId('qbt-port'), '70000');
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId('qbt-save'));
  });

  // PUT must NOT have been called.
  expect(putCalled).toBe(false);
  // Port field error is shown.
  await waitFor(() => expect(screen.getByTestId('qbt-port-error')).toBeTruthy());
});
