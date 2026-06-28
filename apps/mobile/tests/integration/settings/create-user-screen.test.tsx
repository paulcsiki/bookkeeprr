import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import CreateUser from '@/screens/settings/CreateUser';
import Users from '@/screens/settings/Users';
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

// Mutable nav/route handles so individual tests can assert against the mocked
// navigation methods (mirrors the EditIndexer screen-test harness).
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
    useRoute: () => ({ params: mockRouteParams, key: 'mock-route', name: 'CreateUser' }),
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

it('POSTs the entered body and pops back on success', async () => {
  let posted: unknown = null;
  server.use(
    http.post('https://srv/api/users', async ({ request }) => {
      posted = await request.json();
      return HttpResponse.json({ user: { id: 2, username: 'kib', role: 'user' } }, { status: 201 });
    }),
  );

  await act(async () => {
    renderTree(<CreateUser />);
  });

  await waitFor(() => expect(screen.getByTestId('screen-create-user')).toBeTruthy());

  await act(async () => {
    fireEvent.changeText(screen.getByTestId('cu-username'), 'kib');
    fireEvent.changeText(screen.getByTestId('cu-password'), 'password1');
  });

  await act(async () => {
    fireEvent.press(screen.getByTestId('cu-submit'));
  });

  await waitFor(() =>
    expect(posted).toMatchObject({
      username: 'kib',
      password: 'password1',
      role: 'user',
      mustChangePassword: true,
    }),
  );
  await waitFor(() => expect(mockGoBack).toHaveBeenCalled());
});

it('a too-short password blocks the POST and does not pop back', async () => {
  let posted = false;
  server.use(
    http.post('https://srv/api/users', () => {
      posted = true;
      return HttpResponse.json({ user: { id: 2 } }, { status: 201 });
    }),
  );

  await act(async () => {
    renderTree(<CreateUser />);
  });

  await waitFor(() => expect(screen.getByTestId('screen-create-user')).toBeTruthy());

  await act(async () => {
    fireEvent.changeText(screen.getByTestId('cu-username'), 'kib');
    fireEvent.changeText(screen.getByTestId('cu-password'), 'short');
  });

  await act(async () => {
    fireEvent.press(screen.getByTestId('cu-submit'));
  });

  expect(posted).toBe(false);
  expect(mockGoBack).not.toHaveBeenCalled();
});

it('shows the server 409 message inline and does not pop back', async () => {
  server.use(
    http.post('https://srv/api/users', () =>
      HttpResponse.json({ message: 'Username already exists' }, { status: 409 }),
    ),
  );

  await act(async () => {
    renderTree(<CreateUser />);
  });

  await waitFor(() => expect(screen.getByTestId('screen-create-user')).toBeTruthy());

  await act(async () => {
    fireEvent.changeText(screen.getByTestId('cu-username'), 'admin');
    fireEvent.changeText(screen.getByTestId('cu-password'), 'password1');
  });

  await act(async () => {
    fireEvent.press(screen.getByTestId('cu-submit'));
  });

  await waitFor(() => expect(screen.getByTestId('create-user-error')).toBeTruthy());
  expect(screen.getByText('Username already exists')).toBeTruthy();
  expect(mockGoBack).not.toHaveBeenCalled();
});

it('the Add user button on the Users screen navigates to CreateUser', async () => {
  server.use(
    adminMe(),
    http.get('https://srv/api/users', () => HttpResponse.json({ users: [] })),
  );

  await act(async () => {
    renderTree(<Users />);
  });

  await waitFor(() => expect(screen.getByTestId('btn-add-user')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByTestId('btn-add-user'));
  });

  expect(mockNavigate).toHaveBeenCalledWith('CreateUser');
});
