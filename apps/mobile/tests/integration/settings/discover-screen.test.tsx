import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Discover from '@/screens/settings/Discover';
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

const discoverGet = (trendingSource: 'anilist' | 'mal') =>
  http.get('https://srv/api/settings/discover', () =>
    HttpResponse.json({ trendingSource }),
  );

function renderScreen() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <Discover />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

it('seeds from GET and renders source options', async () => {
  server.use(adminMe(), discoverGet('anilist'));

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('screen-discover')).toBeTruthy());
  await waitFor(() => expect(screen.getByTestId('discover-src-anilist')).toBeTruthy());
  expect(screen.getByTestId('discover-src-mal')).toBeTruthy();
});

it('selecting mal + Save PUTs {trendingSource:"mal"}', async () => {
  let putBody: Record<string, unknown> | null = null;
  server.use(
    adminMe(),
    discoverGet('anilist'),
    http.put('https://srv/api/settings/discover', async ({ request }) => {
      putBody = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ trendingSource: 'mal' });
    }),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('discover-src-mal')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByTestId('discover-src-mal'));
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId('discover-save'));
  });

  await waitFor(() => expect(putBody).not.toBeNull());
  expect(putBody).toEqual({ trendingSource: 'mal' });
});

it('Save is disabled when not dirty', async () => {
  server.use(adminMe(), discoverGet('anilist'));

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('discover-save')).toBeTruthy());
  expect(screen.getByTestId('discover-save').props.accessibilityState?.disabled).toBe(true);
});

it('non-admin sees read-only note, not the form', async () => {
  server.use(
    http.get('https://srv/api/mobile/me', () =>
      HttpResponse.json({ id: 2, username: 'reader', email: null, displayName: null, role: 'user' }),
    ),
    discoverGet('anilist'),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('screen-discover')).toBeTruthy());
  await waitFor(() => expect(screen.getByTestId('discover-readonly-note')).toBeTruthy());
  expect(screen.queryByTestId('discover-src-anilist')).toBeNull();
});
