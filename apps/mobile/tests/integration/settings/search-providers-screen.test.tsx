import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SearchProviders from '@/screens/settings/SearchProviders';
import ComicVine from '@/screens/settings/ComicVine';
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

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      navigate: jest.fn(),
      goBack: jest.fn(),
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

const allEnabled = {
  anilist: true,
  mal: true,
  mangadex: true,
  comicvine: true,
  openlibrary: true,
  audnex: true,
  novelupdates: true,
};

const searchProvidersGet = (data = allEnabled) =>
  http.get('https://srv/api/settings/search-providers', () => HttpResponse.json(data));

function makeQc() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

// ─── Search Providers Screen ──────────────────────────────────────────────────

describe('SearchProviders screen', () => {
  it('renders all 7 provider toggles', async () => {
    server.use(adminMe(), searchProvidersGet());

    await act(async () => {
      render(
        <ThemeProvider>
          <AuthProvider>
            <QueryClientProvider client={makeQc()}>
              <SearchProviders />
            </QueryClientProvider>
          </AuthProvider>
        </ThemeProvider>,
      );
    });

    await waitFor(() => expect(screen.getByTestId('screen-search-providers')).toBeTruthy());
    // Wait for the first toggle to appear (data loaded), then assert all 7.
    await waitFor(() => expect(screen.getByTestId('sp-anilist')).toBeTruthy());
    for (const key of ['anilist', 'mal', 'mangadex', 'comicvine', 'openlibrary', 'audnex', 'novelupdates']) {
      expect(screen.getByTestId(`sp-${key}`)).toBeTruthy();
    }
  });

  it('toggles mangadex off then Save PUTs the full object with mangadex:false', async () => {
    let putBody: Record<string, unknown> | null = null;
    server.use(
      adminMe(),
      searchProvidersGet(),
      http.put('https://srv/api/settings/search-providers', async ({ request }) => {
        putBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true });
      }),
    );

    await act(async () => {
      render(
        <ThemeProvider>
          <AuthProvider>
            <QueryClientProvider client={makeQc()}>
              <SearchProviders />
            </QueryClientProvider>
          </AuthProvider>
        </ThemeProvider>,
      );
    });

    await waitFor(() => expect(screen.getByTestId('sp-mangadex')).toBeTruthy());

    // Toggle mangadex off
    await act(async () => {
      fireEvent.press(screen.getByTestId('sp-mangadex'));
    });

    // Save
    await act(async () => {
      fireEvent.press(screen.getByTestId('sp-save'));
    });

    await waitFor(() => expect(putBody).not.toBeNull());
    expect(putBody).toEqual({
      anilist: true,
      mal: true,
      mangadex: false,
      comicvine: true,
      openlibrary: true,
      audnex: true,
      novelupdates: true,
    });
  });
});

// ─── ComicVine smoke test ─────────────────────────────────────────────────────

describe('ComicVine screen', () => {
  it('mounts and shows the title and apikey-input', async () => {
    server.use(
      adminMe(),
      http.get('https://srv/api/settings/comicvine', () => HttpResponse.json({ apiKey: '****' })),
    );

    await act(async () => {
      render(
        <ThemeProvider>
          <AuthProvider>
            <QueryClientProvider client={makeQc()}>
              <ComicVine />
            </QueryClientProvider>
          </AuthProvider>
        </ThemeProvider>,
      );
    });

    await waitFor(() => expect(screen.getByTestId('screen-comicvine')).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId('apikey-input')).toBeTruthy());
    expect(screen.getByText('Metadata (ComicVine)')).toBeTruthy();
  });
});
