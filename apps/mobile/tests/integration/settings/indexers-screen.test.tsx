import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Indexers from '@/screens/settings/Indexers';
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

const nyaaConfig = JSON.stringify({
  kind: 'nyaa',
  queryTemplate: '{title}',
  contentTypes: ['manga'],
  categoryByContentType: { manga: '3_1' },
  pollIntervalSeconds: 900,
});

const torznabConfig = JSON.stringify({
  kind: 'torznab',
  queryTemplate: '{title}',
  contentTypes: ['ebook'],
  categoryByContentType: { ebook: '7020' },
  apiKey: '',
  pollIntervalSeconds: 900,
});

const indexersGet = (indexers: unknown[]) =>
  http.get('https://srv/api/indexers', () => HttpResponse.json({ indexers }));

const prowlarrGet = (url = '', apiKey = '') =>
  http.get('https://srv/api/settings/prowlarr', () => HttpResponse.json({ url, apiKey }));

const sampleIndexers = [
  {
    id: 1,
    kind: 'nyaa',
    name: 'Nyaa',
    baseUrl: 'https://nyaa.si',
    enabled: true,
    configJson: nyaaConfig,
    lastRssAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    lastSearchAt: null,
  },
  {
    id: 2,
    kind: 'torznab',
    name: 'My Torznab',
    baseUrl: 'https://tz.example',
    enabled: false,
    configJson: torznabConfig,
    lastRssAt: null,
    lastSearchAt: null,
  },
];

function renderScreen() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <Indexers />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

it('renders indexer rows from the mocked GET', async () => {
  server.use(adminMe(), prowlarrGet(), indexersGet(sampleIndexers));

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('screen-indexers')).toBeTruthy());
  await waitFor(() => expect(screen.getByTestId('indexer-row-1')).toBeTruthy());
  expect(screen.getByTestId('indexer-row-2')).toBeTruthy();
  expect(screen.getByText('Nyaa')).toBeTruthy();
  expect(screen.getByText('My Torznab')).toBeTruthy();
});

it('toggling enable PATCHes { enabled: false }', async () => {
  let patchBody: Record<string, unknown> | null = null;
  let patchedId: string | null = null;
  server.use(
    adminMe(),
    prowlarrGet(),
    indexersGet(sampleIndexers),
    http.patch('https://srv/api/indexers/:id', async ({ request, params }) => {
      patchBody = (await request.json()) as Record<string, unknown>;
      patchedId = params.id as string;
      return HttpResponse.json({ ok: true });
    }),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('indexer-enabled-1')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByTestId('indexer-enabled-1'));
  });

  await waitFor(() => expect(patchBody).not.toBeNull());
  expect(patchedId).toBe('1');
  expect(patchBody).toEqual({ enabled: false });
});

it('delete requires a confirm tap then DELETEs', async () => {
  let deletedId: string | null = null;
  server.use(
    adminMe(),
    prowlarrGet(),
    indexersGet(sampleIndexers),
    http.delete('https://srv/api/indexers/:id', ({ params }) => {
      deletedId = params.id as string;
      return HttpResponse.json({ ok: true });
    }),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('indexer-delete-1')).toBeTruthy());

  // First tap arms the confirm; no DELETE yet.
  await act(async () => {
    fireEvent.press(screen.getByTestId('indexer-delete-1'));
  });
  expect(deletedId).toBeNull();

  // Second tap confirms.
  await act(async () => {
    fireEvent.press(screen.getByTestId('indexer-delete-1'));
  });

  await waitFor(() => expect(deletedId).toBe('1'));
});

it('Prowlarr Save PUTs /api/settings/prowlarr', async () => {
  let putBody: Record<string, unknown> | null = null;
  server.use(
    adminMe(),
    prowlarrGet('http://prowlarr:9696', '****'),
    indexersGet([]),
    http.put('https://srv/api/settings/prowlarr', async ({ request }) => {
      putBody = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ ok: true });
    }),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('prowlarr-url')).toBeTruthy());
  expect(screen.getByTestId('prowlarr-url').props.value).toBe('http://prowlarr:9696');

  await act(async () => {
    fireEvent.changeText(screen.getByTestId('prowlarr-url'), 'http://updated:9696');
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId('prowlarr-save'));
  });

  await waitFor(() => expect(putBody).not.toBeNull());
  // apiKey left blank → server keeps the stored key.
  expect(putBody).toEqual({ url: 'http://updated:9696', apiKey: '' });
});

it('Prowlarr Sync shows the added/updated/disabled summary', async () => {
  server.use(
    adminMe(),
    prowlarrGet('http://prowlarr:9696', '****'),
    indexersGet([]),
    http.post('https://srv/api/indexers/prowlarr/sync', () =>
      HttpResponse.json({ added: 2, updated: 1, disabled: 3 }),
    ),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('prowlarr-sync')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByTestId('prowlarr-sync'));
  });

  await waitFor(() => expect(screen.getByTestId('prowlarr-result')).toBeTruthy());
  expect(screen.getByText(/added 2/i)).toBeTruthy();
  expect(screen.getByText(/updated 1/i)).toBeTruthy();
  expect(screen.getByText(/disabled 3/i)).toBeTruthy();
});
