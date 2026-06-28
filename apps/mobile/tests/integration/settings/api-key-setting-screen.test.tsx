import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiKeySettingScreen } from '@/features/settings/ApiKeySettingScreen';
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

// Stable goBack spy so back-button tests can assert calls.
// Must be prefixed with "mock" so Babel's jest.mock factory scope check allows it.
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

// Mirrors ComicVine: GET returns the object directly with the masked sentinel.
const comicvineGet = (apiKey: string) =>
  http.get('https://srv/api/settings/comicvine', () => HttpResponse.json({ apiKey }));

function renderScreen() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <ApiKeySettingScreen
            title="Metadata (ComicVine)"
            getPath="/api/settings/comicvine"
            putPath="/api/settings/comicvine"
            fieldName="apiKey"
            testPath="/api/comicvine/test-connection"
            testID="screen-comicvine"
          />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

it('shows "key is set" status when the GET returns the masked sentinel', async () => {
  server.use(adminMe(), comicvineGet('****'));

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('screen-comicvine')).toBeTruthy());
  await waitFor(() => expect(screen.getByTestId('apikey-status')).toBeTruthy());
  expect(screen.getByText(/key is set/i)).toBeTruthy();
});

it('PUTs the typed value on Save', async () => {
  let putBody: Record<string, unknown> | null = null;
  server.use(
    adminMe(),
    comicvineGet('****'),
    http.put('https://srv/api/settings/comicvine', async ({ request }) => {
      putBody = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ ok: true });
    }),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('apikey-input')).toBeTruthy());

  await act(async () => {
    fireEvent.changeText(screen.getByTestId('apikey-input'), 'newkey');
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId('apikey-save'));
  });

  await waitFor(() => expect(putBody).not.toBeNull());
  expect(putBody).toEqual({ apiKey: 'newkey' });
  await waitFor(() => expect(screen.getByTestId('apikey-saved')).toBeTruthy());
});

it('PUTs a blank value when Save is pressed with an empty field (keep current)', async () => {
  let putBody: Record<string, unknown> | null = null;
  server.use(
    adminMe(),
    comicvineGet('****'),
    http.put('https://srv/api/settings/comicvine', async ({ request }) => {
      putBody = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ ok: true });
    }),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('apikey-save')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByTestId('apikey-save'));
  });

  await waitFor(() => expect(putBody).not.toBeNull());
  expect(putBody).toEqual({ apiKey: '' });
});

it('renders the test result when Test succeeds', async () => {
  server.use(
    adminMe(),
    comicvineGet('****'),
    http.post('https://srv/api/comicvine/test-connection', () => HttpResponse.json({ ok: true })),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('apikey-test')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByTestId('apikey-test'));
  });

  await waitFor(() => expect(screen.getByTestId('apikey-test-result')).toBeTruthy());
});

it('pressing the back button calls navigation.goBack', async () => {
  mockGoBack.mockClear();
  server.use(adminMe(), comicvineGet('****'));

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('apikey-back')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByTestId('apikey-back'));
  });

  expect(mockGoBack).toHaveBeenCalledTimes(1);
});

it('shows apikey-save-error when the PUT returns a 500', async () => {
  server.use(
    adminMe(),
    comicvineGet('****'),
    http.put('https://srv/api/settings/comicvine', () =>
      HttpResponse.json({ message: 'Internal server error' }, { status: 500 }),
    ),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('apikey-save')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByTestId('apikey-save'));
  });

  await waitFor(() => expect(screen.getByTestId('apikey-save-error')).toBeTruthy());
  expect(screen.queryByTestId('apikey-saved')).toBeNull();
});
