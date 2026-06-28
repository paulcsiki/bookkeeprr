import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MobAccount } from '@/screens/settings/MobAccount';
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

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

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
    useRoute: () => ({ params: {}, key: 'mock-route', name: 'MobAccount' }),
    useFocusEffect: (cb: () => void | (() => void)) => {
      cb();
    },
    useNavigationState: () => undefined,
    useIsFocused: () => true,
  };
});

beforeEach(() => {
  mockNavigate.mockClear();
  server.use(
    http.get('https://srv/api/mobile/me', () =>
      HttpResponse.json({ id: 1, username: 'admin', email: null, displayName: null, role: 'admin' }),
    ),
  );
});

function renderScreen() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <MobAccount />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

it('the Appearance row navigates to the Appearance screen', async () => {
  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('row-mob-appearance')).toBeTruthy());
  await act(async () => {
    fireEvent.press(screen.getByTestId('row-mob-appearance'));
  });

  expect(mockNavigate).toHaveBeenCalledWith('Appearance');
});
