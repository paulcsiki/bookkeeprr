import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Storage from '@/screens/settings/Storage';
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

const fullStorage = () => ({
  contentTypePaths: {
    manga: { libraryRoot: '', qbtCategory: '' },
    comic: { libraryRoot: '', qbtCategory: '' },
    light_novel: { libraryRoot: '', qbtCategory: '' },
    ebook: { libraryRoot: '', qbtCategory: '' },
    audiobook: { libraryRoot: '', qbtCategory: '' },
  },
  torrentCleanup: { mode: 'never', deleteFiles: false },
  imageCache: { enabled: false, dir: '' },
});

const storageGet = (override?: Record<string, unknown>) =>
  http.get('https://srv/api/settings/storage', () =>
    HttpResponse.json({ ...fullStorage(), ...override }),
  );

function renderScreen() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <Storage />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

it('renders the screen with per-content-type and cleanup controls', async () => {
  server.use(adminMe(), storageGet());

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('screen-storage')).toBeTruthy());
  await waitFor(() => expect(screen.getByTestId('storage-manga-root')).toBeTruthy());
  expect(screen.getByTestId('storage-manga-category')).toBeTruthy();
  expect(screen.getByTestId('storage-cleanup-never')).toBeTruthy();
  expect(screen.getByTestId('storage-delete-files')).toBeTruthy();
  expect(screen.getByTestId('storage-cache-enabled')).toBeTruthy();
  expect(screen.getByTestId('storage-cache-dir')).toBeTruthy();
});

it('editing manga libraryRoot + Save PUTs the full object with that value', async () => {
  let putBody: Record<string, unknown> | null = null;
  server.use(
    adminMe(),
    storageGet(),
    http.put('https://srv/api/settings/storage', async ({ request }) => {
      putBody = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ ok: true });
    }),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('storage-manga-root')).toBeTruthy());

  await act(async () => {
    fireEvent.changeText(screen.getByTestId('storage-manga-root'), '/data/manga');
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId('storage-save'));
  });

  await waitFor(() => expect(putBody).not.toBeNull());
  expect(putBody).toEqual({
    contentTypePaths: {
      manga: { libraryRoot: '/data/manga', qbtCategory: '' },
      comic: { libraryRoot: '', qbtCategory: '' },
      light_novel: { libraryRoot: '', qbtCategory: '' },
      ebook: { libraryRoot: '', qbtCategory: '' },
      audiobook: { libraryRoot: '', qbtCategory: '' },
    },
    torrentCleanup: { mode: 'never', deleteFiles: false },
    imageCache: { enabled: false, dir: '' },
  });
});

it('switching cleanup mode to after_ratio reveals the ratio field and Save includes ratio', async () => {
  let putBody: Record<string, unknown> | null = null;
  server.use(
    adminMe(),
    storageGet(),
    http.put('https://srv/api/settings/storage', async ({ request }) => {
      putBody = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ ok: true });
    }),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('storage-cleanup-after_ratio')).toBeTruthy());

  // Ratio field hidden until after_ratio is selected.
  expect(screen.queryByTestId('storage-ratio')).toBeNull();

  await act(async () => {
    fireEvent.press(screen.getByTestId('storage-cleanup-after_ratio'));
  });

  await waitFor(() => expect(screen.getByTestId('storage-ratio')).toBeTruthy());

  await act(async () => {
    fireEvent.changeText(screen.getByTestId('storage-ratio'), '1.5');
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId('storage-save'));
  });

  await waitFor(() => expect(putBody).not.toBeNull());
  expect((putBody as unknown as Record<string, unknown>).torrentCleanup).toEqual({
    mode: 'after_ratio',
    ratio: 1.5,
    deleteFiles: false,
  });
});

it('image-cache enabled toggle persists in the PUT body', async () => {
  let putBody: Record<string, unknown> | null = null;
  server.use(
    adminMe(),
    storageGet(),
    http.put('https://srv/api/settings/storage', async ({ request }) => {
      putBody = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ ok: true });
    }),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('storage-cache-enabled')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByTestId('storage-cache-enabled'));
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId('storage-save'));
  });

  await waitFor(() => expect(putBody).not.toBeNull());
  expect((putBody as unknown as Record<string, unknown>).imageCache).toEqual({ enabled: true, dir: '' });
});

it('non-admin sees read-only note, not the form', async () => {
  server.use(
    http.get('https://srv/api/mobile/me', () =>
      HttpResponse.json({ id: 2, username: 'reader', email: null, displayName: null, role: 'user' }),
    ),
    storageGet(),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('screen-storage')).toBeTruthy());
  await waitFor(() => expect(screen.getByTestId('storage-readonly-note')).toBeTruthy());
  expect(screen.queryByTestId('storage-manga-root')).toBeNull();
});

it('switching mode to after_seed_time reveals seed-minutes field and Save PUTs seedMinutes without ratio', async () => {
  let putBody: Record<string, unknown> | null = null;
  server.use(
    adminMe(),
    storageGet(),
    http.put('https://srv/api/settings/storage', async ({ request }) => {
      putBody = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ ok: true });
    }),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('storage-cleanup-after_seed_time')).toBeTruthy());

  // Seed-minutes field is hidden until after_seed_time is selected.
  expect(screen.queryByTestId('storage-seed-minutes')).toBeNull();

  await act(async () => {
    fireEvent.press(screen.getByTestId('storage-cleanup-after_seed_time'));
  });

  await waitFor(() => expect(screen.getByTestId('storage-seed-minutes')).toBeTruthy());

  await act(async () => {
    fireEvent.changeText(screen.getByTestId('storage-seed-minutes'), '1440');
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId('storage-save'));
  });

  await waitFor(() => expect(putBody).not.toBeNull());
  const cleanup = (putBody as unknown as Record<string, unknown>).torrentCleanup as Record<string, unknown>;
  expect(cleanup.mode).toBe('after_seed_time');
  expect(cleanup.seedMinutes).toBe(1440);
  expect(cleanup).not.toHaveProperty('ratio');
});

it('ratio=0 keeps Save disabled and shows field error', async () => {
  server.use(adminMe(), storageGet());

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('storage-cleanup-after_ratio')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByTestId('storage-cleanup-after_ratio'));
  });

  await waitFor(() => expect(screen.getByTestId('storage-ratio')).toBeTruthy());

  await act(async () => {
    fireEvent.changeText(screen.getByTestId('storage-ratio'), '0');
  });

  // Save button must remain disabled.
  const saveBtn = screen.getByTestId('storage-save');
  expect(saveBtn.props.accessibilityState?.disabled ?? saveBtn.props.disabled).toBeTruthy();

  // Field error text must be shown.
  expect(screen.getByText('Enter a positive number')).toBeTruthy();
});

it('pressing btn-back-storage calls navigation.goBack', async () => {
  server.use(adminMe(), storageGet());

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('btn-back-storage')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByTestId('btn-back-storage'));
  });

  expect(mockGoBack).toHaveBeenCalledTimes(1);
});
