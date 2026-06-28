import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import EditIndexer from '@/screens/settings/EditIndexer';
import Indexers from '@/screens/settings/Indexers';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/auth/AuthContext';
import type { IndexerView } from '@/api/schemas';
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

// Mutable nav/route handles so individual tests can drive route params and
// assert against the mocked navigation methods.
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
let mockRouteParams: Record<string, unknown> = {};

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      navigate: mockNavigate,
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
    useRoute: () => ({ params: mockRouteParams, key: 'mock-route', name: 'EditIndexer' }),
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

function renderTree(node: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>{node}</QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  mockNavigate.mockClear();
  mockGoBack.mockClear();
  mockRouteParams = {};
});

it('creates a torznab indexer with the right POST body (create mode)', async () => {
  let body: Record<string, unknown> | null = null;
  mockRouteParams = {};
  server.use(
    http.post('https://srv/api/indexers', async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ id: 9 }, { status: 201 });
    }),
  );

  await act(async () => {
    renderTree(<EditIndexer />);
  });

  await waitFor(() => expect(screen.getByTestId('screen-edit-indexer')).toBeTruthy());

  // Pick the torznab kind.
  await act(async () => {
    fireEvent.press(screen.getByTestId('ei-kind-torznab'));
  });

  await act(async () => {
    fireEvent.changeText(screen.getByTestId('ei-name'), 'My Torznab');
    fireEvent.changeText(screen.getByTestId('ei-baseurl'), 'https://torznab.example');
  });

  // Select the ebook content type and give it an api key + poll.
  await act(async () => {
    fireEvent.press(screen.getByTestId('ei-ct-ebook'));
  });
  await act(async () => {
    fireEvent.changeText(screen.getByTestId('ei-apikey'), 'secret-key');
    fireEvent.changeText(screen.getByTestId('ei-poll'), '1200');
  });

  await act(async () => {
    fireEvent.press(screen.getByTestId('ei-save'));
  });

  await waitFor(() => expect(body).not.toBeNull());
  expect(body).toMatchObject({
    kind: 'torznab',
    name: 'My Torznab',
    baseUrl: 'https://torznab.example',
    enabled: true,
  });
  const cfg = (body as unknown as { configJson: Record<string, unknown> }).configJson;
  expect(cfg.kind).toBe('torznab');
  expect(cfg.apiKey).toBe('secret-key');
  expect(cfg.contentTypes).toEqual(['ebook']);
  expect(cfg.pollIntervalSeconds).toBe(1200);
  // On success the screen pops back (replaces the old onSaved callback).
  await waitFor(() => expect(mockGoBack).toHaveBeenCalled());
});

it('blocks creating a torznab indexer with a blank API key', async () => {
  let posted = false;
  mockRouteParams = {};
  server.use(
    http.post('https://srv/api/indexers', () => {
      posted = true;
      return HttpResponse.json({ id: 9 }, { status: 201 });
    }),
  );

  await act(async () => {
    renderTree(<EditIndexer />);
  });

  await waitFor(() => expect(screen.getByTestId('screen-edit-indexer')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByTestId('ei-kind-torznab'));
  });
  // Everything filled EXCEPT the api key.
  await act(async () => {
    fireEvent.changeText(screen.getByTestId('ei-name'), 'No Key TZ');
    fireEvent.changeText(screen.getByTestId('ei-baseurl'), 'https://torznab.example');
  });

  await act(async () => {
    fireEvent.press(screen.getByTestId('ei-save'));
  });

  // Inline validation error shown; no network call; no navigation.
  await waitFor(() => expect(screen.getByTestId('ei-error')).toBeTruthy());
  expect(screen.getByText(/API key is required for a Torznab indexer\./)).toBeTruthy();
  expect(posted).toBe(false);
  expect(mockGoBack).not.toHaveBeenCalled();
});

it('Fetch capabilities renders discovered categories', async () => {
  mockRouteParams = {};
  server.use(
    http.post('https://srv/api/indexers/torznab/caps', () =>
      HttpResponse.json({
        categories: [
          {
            id: '7000',
            name: 'Books',
            subcats: [
              { id: '7020', name: 'EBook' },
              { id: '7030', name: 'Comics' },
            ],
          },
        ],
      }),
    ),
  );

  await act(async () => {
    renderTree(<EditIndexer />);
  });

  await waitFor(() => expect(screen.getByTestId('screen-edit-indexer')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByTestId('ei-kind-torznab'));
  });
  await act(async () => {
    fireEvent.changeText(screen.getByTestId('ei-baseurl'), 'https://torznab.example');
  });
  // Select a content type so the category multi-select renders.
  await act(async () => {
    fireEvent.press(screen.getByTestId('ei-ct-ebook'));
  });

  await act(async () => {
    fireEvent.press(screen.getByTestId('ei-fetch-caps'));
  });

  // Parent pill labelled by id, plus a subcat pill for each discovered subcat.
  await waitFor(() => expect(screen.getByTestId('ei-cat-ebook-7000')).toBeTruthy());
  expect(screen.getByTestId('ei-cat-ebook-7020')).toBeTruthy();
  expect(screen.getByTestId('ei-cat-ebook-7030')).toBeTruthy();
  expect(screen.getByText(/EBook/)).toBeTruthy();
  expect(screen.getByText(/Comics/)).toBeTruthy();
});

it('editing with a blank apiKey sends empty string (keep-signal) in the PATCH (edit mode)', async () => {
  let patch: { configJson?: Record<string, unknown>; name?: string } | null = null;
  mockRouteParams = { indexerId: 3 };

  const indexer: IndexerView = {
    id: 3,
    kind: 'torznab',
    name: 'Existing TZ',
    baseUrl: 'https://tz.example',
    enabled: true,
    configJson: JSON.stringify({
      kind: 'torznab',
      queryTemplate: '{title}',
      contentTypes: ['ebook'],
      categoryByContentType: { ebook: '7020' },
      apiKey: '', // masked on GET
      pollIntervalSeconds: 900,
    }),
    lastRssAt: null,
    lastSearchAt: null,
  };

  server.use(
    // Edit mode sources the indexer from the indexers list query.
    http.get('https://srv/api/indexers', () => HttpResponse.json({ indexers: [indexer] })),
    http.patch('https://srv/api/indexers/:id', async ({ request }) => {
      const body = (await request.json()) as {
        configJson?: Record<string, unknown>;
        name?: string;
      };
      // Contract: apiKey must always be present as a string ('' = keep-signal).
      expect(typeof (body.configJson as Record<string, unknown> | undefined)?.apiKey).toBe('string');
      patch = body;
      return HttpResponse.json({ ok: true });
    }),
  );

  await act(async () => {
    renderTree(<EditIndexer />);
  });

  // Wait for the indexer to resolve and seed the form (name prefilled).
  await waitFor(() => expect(screen.getByTestId('ei-name').props.value).toBe('Existing TZ'));

  // Edit the name; leave the apiKey blank.
  await act(async () => {
    fireEvent.changeText(screen.getByTestId('ei-name'), 'Renamed TZ');
  });

  await act(async () => {
    fireEvent.press(screen.getByTestId('ei-save'));
  });

  await waitFor(() => expect(patch).not.toBeNull());
  expect(patch!.name).toBe('Renamed TZ');
  expect(patch!.configJson).toBeDefined();
  expect(patch!.configJson!.kind).toBe('torznab');
  // Blank secret → send '' (the server keep-signal); must NOT be omitted.
  expect(patch!.configJson!.apiKey).toBe('');
  await waitFor(() => expect(mockGoBack).toHaveBeenCalled());
});

it('creates a mam indexer with the right POST body (create mode)', async () => {
  let body: Record<string, unknown> | null = null;
  mockRouteParams = {};
  server.use(
    http.post('https://srv/api/indexers', async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ id: 10 }, { status: 201 });
    }),
  );

  await act(async () => {
    renderTree(<EditIndexer />);
  });

  await waitFor(() => expect(screen.getByTestId('screen-edit-indexer')).toBeTruthy());

  // Pick the mam kind.
  await act(async () => {
    fireEvent.press(screen.getByTestId('ei-kind-mam'));
  });

  await act(async () => {
    fireEvent.changeText(screen.getByTestId('ei-name'), 'My MAM');
    fireEvent.changeText(screen.getByTestId('ei-mamid'), 'mam-session-cookie-value');
  });

  // Select ebook content type and fill in a numeric category.
  await act(async () => {
    fireEvent.press(screen.getByTestId('ei-ct-ebook'));
  });
  await act(async () => {
    fireEvent.changeText(screen.getByTestId('ei-cat-ebook'), '14');
  });

  await act(async () => {
    fireEvent.press(screen.getByTestId('ei-save'));
  });

  await waitFor(() => expect(body).not.toBeNull());
  expect(body).toMatchObject({
    kind: 'mam',
    name: 'My MAM',
    baseUrl: 'https://www.myanonamouse.net',
    enabled: true,
  });
  const cfg = (body as unknown as { configJson: Record<string, unknown> }).configJson;
  expect(cfg.kind).toBe('mam');
  expect(cfg.mamId).toBe('mam-session-cookie-value');
  expect(cfg.contentTypes).toEqual(['ebook']);
  expect((cfg.categoryByContentType as Record<string, number>).ebook).toBe(14);
  // On success the screen pops back.
  await waitFor(() => expect(mockGoBack).toHaveBeenCalled());
});

it('blocks creating a mam indexer with a blank MAM ID', async () => {
  let posted = false;
  mockRouteParams = {};
  server.use(
    http.post('https://srv/api/indexers', () => {
      posted = true;
      return HttpResponse.json({ id: 10 }, { status: 201 });
    }),
  );

  await act(async () => {
    renderTree(<EditIndexer />);
  });

  await waitFor(() => expect(screen.getByTestId('screen-edit-indexer')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByTestId('ei-kind-mam'));
  });
  // Fill name but leave mamId blank.
  await act(async () => {
    fireEvent.changeText(screen.getByTestId('ei-name'), 'No ID MAM');
  });

  await act(async () => {
    fireEvent.press(screen.getByTestId('ei-save'));
  });

  await waitFor(() => expect(screen.getByTestId('ei-error')).toBeTruthy());
  expect(screen.getByText(/MAM ID is required for a MyAnonaMouse indexer\./)).toBeTruthy();
  expect(posted).toBe(false);
  expect(mockGoBack).not.toHaveBeenCalled();
});

it('editing a mam indexer with a blank mamId sends empty string (keep-signal) in the PATCH (edit mode)', async () => {
  let patch: { configJson?: Record<string, unknown>; name?: string } | null = null;
  mockRouteParams = { indexerId: 4 };

  const indexer: IndexerView = {
    id: 4,
    kind: 'mam',
    name: 'Existing MAM',
    baseUrl: 'https://www.myanonamouse.net',
    enabled: true,
    configJson: JSON.stringify({
      kind: 'mam',
      queryTemplate: '{title} {extra}',
      contentTypes: ['ebook'],
      categoryByContentType: { ebook: 14 },
      mamId: '', // masked on GET
      proxyUrl: '',
      searchIn: ['title'],
      pollIntervalSeconds: 900,
    }),
    lastRssAt: null,
    lastSearchAt: null,
  };

  server.use(
    http.get('https://srv/api/indexers', () => HttpResponse.json({ indexers: [indexer] })),
    http.patch('https://srv/api/indexers/:id', async ({ request }) => {
      const body = (await request.json()) as {
        configJson?: Record<string, unknown>;
        name?: string;
      };
      // Contract: mamId must always be present as a string ('' = keep-signal).
      expect(typeof (body.configJson as Record<string, unknown> | undefined)?.mamId).toBe('string');
      patch = body;
      return HttpResponse.json({ ok: true });
    }),
  );

  await act(async () => {
    renderTree(<EditIndexer />);
  });

  // Wait for the indexer to resolve and seed the form (name prefilled).
  await waitFor(() => expect(screen.getByTestId('ei-name').props.value).toBe('Existing MAM'));

  // Edit the name; leave mamId blank (keep-signal).
  await act(async () => {
    fireEvent.changeText(screen.getByTestId('ei-name'), 'Renamed MAM');
  });

  await act(async () => {
    fireEvent.press(screen.getByTestId('ei-save'));
  });

  await waitFor(() => expect(patch).not.toBeNull());
  expect(patch!.name).toBe('Renamed MAM');
  expect(patch!.configJson).toBeDefined();
  expect(patch!.configJson!.kind).toBe('mam');
  // Blank mamId → send '' (the server keep-signal); must NOT be omitted.
  expect(patch!.configJson!.mamId).toBe('');
  await waitFor(() => expect(mockGoBack).toHaveBeenCalled());
});

it('Add indexer on the Indexers screen navigates to the EditIndexer screen', async () => {
  server.use(
    adminMe(),
    http.get('https://srv/api/settings/prowlarr', () => HttpResponse.json({ url: '', apiKey: '' })),
    http.get('https://srv/api/indexers', () => HttpResponse.json({ indexers: [] })),
  );

  await act(async () => {
    renderTree(<Indexers />);
  });

  await waitFor(() => expect(screen.getByTestId('indexer-add')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByTestId('indexer-add'));
  });

  expect(mockNavigate).toHaveBeenCalledWith('EditIndexer', {});
});

it('Tapping an indexer row navigates to EditIndexer with its id (edit entry point)', async () => {
  const indexer: IndexerView = {
    id: 7,
    kind: 'nyaa',
    name: 'Nyaa',
    baseUrl: 'https://nyaa.si',
    enabled: true,
    configJson: JSON.stringify({
      kind: 'nyaa',
      queryTemplate: '{title}',
      contentTypes: ['manga'],
      categoryByContentType: { manga: '3_1' },
      pollIntervalSeconds: 900,
    }),
    lastRssAt: null,
    lastSearchAt: null,
  };

  server.use(
    adminMe(),
    http.get('https://srv/api/settings/prowlarr', () => HttpResponse.json({ url: '', apiKey: '' })),
    http.get('https://srv/api/indexers', () => HttpResponse.json({ indexers: [indexer] })),
  );

  await act(async () => {
    renderTree(<Indexers />);
  });

  await waitFor(() => expect(screen.getByTestId('indexer-row-7')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByTestId('indexer-row-7'));
  });

  expect(mockNavigate).toHaveBeenCalledWith('EditIndexer', { indexerId: 7 });
});
