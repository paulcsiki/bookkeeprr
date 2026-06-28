import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FlareSolverr from '@/screens/settings/FlareSolverr';
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

const fsGet = (url = '') =>
  http.get('https://srv/api/settings/flaresolverr', () =>
    HttpResponse.json({ url }),
  );

function renderScreen() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <FlareSolverr />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

it('seeds url field from GET', async () => {
  server.use(adminMe(), fsGet('http://flaresolverr:8191'));

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('screen-flaresolverr')).toBeTruthy());
  await waitFor(() => expect(screen.getByTestId('fs-url')).toBeTruthy());

  expect(screen.getByTestId('fs-url').props.value).toBe('http://flaresolverr:8191');
});

it('editing url + Save PUTs {url}', async () => {
  let putBody: Record<string, unknown> | null = null;
  server.use(
    adminMe(),
    fsGet(),
    http.put('https://srv/api/settings/flaresolverr', async ({ request }) => {
      putBody = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ ok: true });
    }),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('fs-url')).toBeTruthy());

  await act(async () => {
    fireEvent.changeText(screen.getByTestId('fs-url'), 'http://flaresolverr:8191');
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId('fs-save'));
  });

  await waitFor(() => expect(putBody).not.toBeNull());
  expect(putBody).toEqual({ url: 'http://flaresolverr:8191' });
});

it('Test button POSTs and shows ok result', async () => {
  server.use(
    adminMe(),
    fsGet('http://flaresolverr:8191'),
    http.post('https://srv/api/settings/flaresolverr/test', () =>
      HttpResponse.json({ ok: true }),
    ),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('fs-test')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByTestId('fs-test'));
  });

  await waitFor(() => expect(screen.getByTestId('fs-test-result')).toBeTruthy());
});

it('Test button shows error result when server returns ok:false', async () => {
  server.use(
    adminMe(),
    fsGet('http://flaresolverr:8191'),
    http.post('https://srv/api/settings/flaresolverr/test', () =>
      HttpResponse.json({ ok: false, error: 'Connection refused' }, { status: 502 }),
    ),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('fs-test')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByTestId('fs-test'));
  });

  await waitFor(() => expect(screen.getByTestId('fs-test-result')).toBeTruthy());
  expect(screen.getByText(/Connection refused/i)).toBeTruthy();
});

it('non-admin sees read-only note, not the form', async () => {
  server.use(
    http.get('https://srv/api/mobile/me', () =>
      HttpResponse.json({ id: 2, username: 'reader', email: null, displayName: null, role: 'user' }),
    ),
    fsGet(),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('screen-flaresolverr')).toBeTruthy());
  await waitFor(() => expect(screen.getByTestId('fs-readonly-note')).toBeTruthy());
  expect(screen.queryByTestId('fs-url')).toBeNull();
});
