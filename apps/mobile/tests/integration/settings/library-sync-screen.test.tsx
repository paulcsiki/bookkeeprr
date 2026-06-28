import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LibrarySync from '@/screens/settings/LibrarySync';
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

const MASK = '••••••••';

const absGet = (
  overrides: Partial<{
    baseUrl: string | null;
    apiToken: string | null;
    libraryId: string | null;
    contentTypes: string[];
    enabled: boolean;
    configured: boolean;
  }> = {},
) =>
  http.get('https://srv/api/settings/library-sync/audiobookshelf', () =>
    HttpResponse.json({
      baseUrl: 'https://abs.example',
      apiToken: null,
      libraryId: null,
      contentTypes: ['audiobook'],
      enabled: false,
      configured: false,
      ...overrides,
    }),
  );

const calibreGet = (
  overrides: Partial<{
    baseUrl: string | null;
    username: string | null;
    password: string | null;
    libraryId: string;
    contentTypes: string[];
    enabled: boolean;
    configured: boolean;
  }> = {},
) =>
  http.get('https://srv/api/settings/library-sync/calibre', () =>
    HttpResponse.json({
      baseUrl: 'https://cal.example',
      username: 'reader',
      password: MASK,
      libraryId: 'Calibre Library',
      contentTypes: ['ebook'],
      enabled: true,
      configured: true,
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
          <LibrarySync />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

it('renders the screen with both cards for an admin', async () => {
  server.use(adminMe(), absGet(), calibreGet());

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('screen-library-sync')).toBeTruthy());
  await waitFor(() => expect(screen.getByTestId('abs-baseurl')).toBeTruthy());
  expect(screen.getByTestId('cal-baseurl')).toBeTruthy();
});

it('ABS — editing baseUrl + Save PATCHes the body with apiToken "" (keep) and no configured', async () => {
  let patchBody: Record<string, unknown> | null = null;
  server.use(
    adminMe(),
    absGet(),
    calibreGet(),
    http.patch('https://srv/api/settings/library-sync/audiobookshelf', async ({ request }) => {
      patchBody = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ ok: true });
    }),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('abs-baseurl')).toBeTruthy());

  await act(async () => {
    fireEvent.changeText(screen.getByTestId('abs-baseurl'), 'https://new.abs');
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId('abs-save'));
  });

  await waitFor(() => expect(patchBody).not.toBeNull());
  // apiToken untouched → blank → keep stored; configured must NOT be sent.
  expect(patchBody).toEqual({
    baseUrl: 'https://new.abs',
    apiToken: '',
    libraryId: null,
    contentTypes: ['audiobook'],
    enabled: false,
  });
  expect(patchBody).not.toHaveProperty('configured');
});

it('ABS — when configured, a mocked /libraries populates the abs-library picker', async () => {
  server.use(
    adminMe(),
    absGet({ apiToken: MASK, libraryId: 'lib-1', configured: true }),
    calibreGet(),
    http.get('https://srv/api/settings/library-sync/audiobookshelf/libraries', () =>
      HttpResponse.json({
        libraries: [
          { id: 'lib-1', name: 'Audiobooks', mediaType: 'book' },
          { id: 'lib-2', name: 'Podcasts', mediaType: 'podcast' },
        ],
      }),
    ),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('abs-baseurl')).toBeTruthy());

  // Picker options render from the fetched library list.
  await waitFor(() => expect(screen.getByTestId('abs-library-lib-1')).toBeTruthy());
  expect(screen.getByTestId('abs-library-lib-2')).toBeTruthy();
  expect(screen.getByText('Audiobooks')).toBeTruthy();
  expect(screen.getByText('Podcasts')).toBeTruthy();
});

it('ABS — test scan ok renders the result alert', async () => {
  server.use(
    adminMe(),
    absGet(),
    calibreGet(),
    http.post('https://srv/api/settings/library-sync/audiobookshelf/test', () =>
      HttpResponse.json({ ok: true }),
    ),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('abs-test')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByTestId('abs-test'));
  });

  await waitFor(() => expect(screen.getByTestId('abs-result')).toBeTruthy());
});

it('Calibre — Save PATCHes the body with password "" (keep)', async () => {
  let patchBody: Record<string, unknown> | null = null;
  server.use(
    adminMe(),
    absGet(),
    calibreGet(),
    http.patch('https://srv/api/settings/library-sync/calibre', async ({ request }) => {
      patchBody = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ ok: true });
    }),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('cal-baseurl')).toBeTruthy());

  await act(async () => {
    fireEvent.changeText(screen.getByTestId('cal-baseurl'), 'https://new.cal');
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId('cal-save'));
  });

  await waitFor(() => expect(patchBody).not.toBeNull());
  // password untouched → blank → keep stored; configured must NOT be sent.
  expect(patchBody).toEqual({
    baseUrl: 'https://new.cal',
    username: 'reader',
    password: '',
    libraryId: 'Calibre Library',
    contentTypes: ['ebook'],
    enabled: true,
  });
  expect(patchBody).not.toHaveProperty('configured');
});
