import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LibraryScan from '@/screens/settings/LibraryScan';
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

function renderScreen() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <LibraryScan />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

it('Run scan posts {rootPath} to /api/scan', async () => {
  let postBody: Record<string, unknown> | null = null;
  server.use(
    adminMe(),
    http.post('https://srv/api/scan', async ({ request }) => {
      postBody = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ jobId: 42 }, { status: 202 });
    }),
    http.get('https://srv/api/jobs/42', () =>
      HttpResponse.json({ id: 42, status: 'completed', error: null }),
    ),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('screen-library-scan')).toBeTruthy());
  await waitFor(() => expect(screen.getByTestId('scan-root')).toBeTruthy());

  await act(async () => {
    fireEvent.changeText(screen.getByTestId('scan-root'), '/media/comics');
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId('scan-run'));
  });

  await waitFor(() => expect(postBody).not.toBeNull());
  expect(postBody).toEqual({ rootPath: '/media/comics' });
});

it('shows busy alert on 409', async () => {
  server.use(
    adminMe(),
    http.post('https://srv/api/scan', async () =>
      HttpResponse.json(
        { error: 'a library_scan is already in progress', existingJobId: 3 },
        { status: 409 },
      ),
    ),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('scan-root')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByTestId('scan-run'));
  });

  await waitFor(() => expect(screen.getByTestId('scan-status')).toBeTruthy());
  expect(screen.getByText(/already in progress/i)).toBeTruthy();
});

it('shows completed status after successful scan + job poll', async () => {
  server.use(
    adminMe(),
    http.post('https://srv/api/scan', async () =>
      HttpResponse.json({ jobId: 7 }, { status: 202 }),
    ),
    http.get('https://srv/api/jobs/7', () =>
      HttpResponse.json({ id: 7, status: 'completed', error: null }),
    ),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('scan-run')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByTestId('scan-run'));
  });

  await waitFor(() => expect(screen.getByTestId('scan-status')).toBeTruthy());
  expect(screen.getByTestId('scan-status').props.children).toMatch(/completed/i);
});
