import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import CloudConnect from '@/screens/settings/CloudConnect';
import Cloud from '@/screens/settings/Cloud';
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
// navigation methods (mirrors the EditIndexer/CreateUser screen-test harness).
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
    useRoute: () => ({ params: mockRouteParams, key: 'mock-route', name: 'CloudConnect' }),
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

const cloudTerms = () =>
  http.get('https://srv/api/settings/cloud/terms', () =>
    HttpResponse.json({
      terms: {
        eulaVersion: '2.1',
        privacyVersion: '1.3',
        eulaUrl: 'https://e',
        privacyUrl: 'https://p',
        effectiveAt: '2026-01-01T00:00:00Z',
      },
    }),
  );

const disconnectedConfig = {
  enabled: false,
  cloudBaseUrl: 'https://c',
  tenantId: null,
  installUuid: 'u',
  acceptedEulaVersion: null,
  acceptedPrivacyVersion: null,
  acceptedAt: null,
  lastRegisterError: null,
};

const connectedConfig = {
  enabled: true,
  cloudBaseUrl: 'https://c',
  tenantId: 'tenant-123',
  installUuid: 'u',
  acceptedEulaVersion: '1.0',
  acceptedPrivacyVersion: '1.0',
  acceptedAt: '2026-01-01T00:00:00Z',
  lastRegisterError: null,
};

const cloudConfig = (config: unknown) =>
  http.get('https://srv/api/settings/cloud', () => HttpResponse.json({ config }));

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

// Defensive read of a button's disabled state: RN's Pressable auto-maps
// `disabled` to accessibilityState.disabled, but fall back to the raw prop so
// the assertion survives a future RN version dropping that auto-mapping.
function submitDisabled() {
  const btn = screen.getByTestId('cloud-connect-submit');
  return btn.props.accessibilityState?.disabled ?? btn.props.disabled;
}

beforeEach(() => {
  mockNavigate.mockClear();
  mockGoBack.mockClear();
  mockRouteParams = {};
});

it('accepts both toggles, POSTs the version fields, and pops back on success', async () => {
  let connectBody: { acceptedEulaVersion: string; acceptedPrivacyVersion: string } | null = null;
  server.use(
    adminMe(),
    cloudTerms(),
    cloudConfig(disconnectedConfig),
    http.post('https://srv/api/settings/cloud/connect', async ({ request }) => {
      connectBody = (await request.json()) as {
        acceptedEulaVersion: string;
        acceptedPrivacyVersion: string;
      };
      return HttpResponse.json({ config: connectedConfig });
    }),
  );

  await act(async () => {
    renderTree(<CloudConnect />);
  });

  await waitFor(() => expect(screen.getByTestId('screen-cloud-connect')).toBeTruthy());

  // Submit is gated until BOTH toggles are on.
  expect(submitDisabled()).toBe(true);

  // Toggles only render once the live terms have loaded.
  await waitFor(() => expect(screen.getByTestId('cloud-accept-eula')).toBeTruthy());
  expect(submitDisabled()).toBe(true);

  await act(async () => {
    fireEvent.press(screen.getByTestId('cloud-accept-eula'));
  });
  // Still gated with only one toggle.
  expect(submitDisabled()).toBe(true);

  await act(async () => {
    fireEvent.press(screen.getByTestId('cloud-accept-privacy'));
  });
  expect(submitDisabled()).toBe(false);

  await act(async () => {
    fireEvent.press(screen.getByTestId('cloud-connect-submit'));
  });

  await waitFor(() => expect(connectBody).not.toBeNull());
  expect(connectBody).toEqual({ acceptedEulaVersion: '2.1', acceptedPrivacyVersion: '1.3' });
  await waitFor(() => expect(mockGoBack).toHaveBeenCalled());
});

it('does not POST while either toggle is unticked (submit disabled)', async () => {
  let posted = false;
  server.use(
    adminMe(),
    cloudTerms(),
    cloudConfig(disconnectedConfig),
    http.post('https://srv/api/settings/cloud/connect', () => {
      posted = true;
      return HttpResponse.json({ config: connectedConfig });
    }),
  );

  await act(async () => {
    renderTree(<CloudConnect />);
  });

  await waitFor(() => expect(screen.getByTestId('cloud-accept-eula')).toBeTruthy());

  // Accept only one of the two toggles.
  await act(async () => {
    fireEvent.press(screen.getByTestId('cloud-accept-eula'));
  });

  // Submit is still disabled and a press is a no-op.
  expect(submitDisabled()).toBe(true);
  await act(async () => {
    fireEvent.press(screen.getByTestId('cloud-connect-submit'));
  });

  expect(posted).toBe(false);
  expect(mockGoBack).not.toHaveBeenCalled();
});

it('surfaces a server connect error inline and does not pop back', async () => {
  server.use(
    adminMe(),
    cloudTerms(),
    cloudConfig(disconnectedConfig),
    http.post('https://srv/api/settings/cloud/connect', () =>
      HttpResponse.json({ message: 'Cloud registration failed: boom' }, { status: 502 }),
    ),
  );

  await act(async () => {
    renderTree(<CloudConnect />);
  });

  await waitFor(() => expect(screen.getByTestId('cloud-accept-eula')).toBeTruthy());
  await act(async () => {
    fireEvent.press(screen.getByTestId('cloud-accept-eula'));
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId('cloud-accept-privacy'));
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId('cloud-connect-submit'));
  });

  await waitFor(() => expect(screen.getByTestId('cloud-connect-error')).toBeTruthy());
  expect(screen.getByText('Cloud registration failed: boom')).toBeTruthy();
  expect(mockGoBack).not.toHaveBeenCalled();
});

it('shows a terms-fetch error inline when the terms endpoint fails', async () => {
  server.use(
    adminMe(),
    cloudConfig(disconnectedConfig),
    http.get('https://srv/api/settings/cloud/terms', () =>
      HttpResponse.json({ message: 'down' }, { status: 503 }),
    ),
  );

  await act(async () => {
    renderTree(<CloudConnect />);
  });

  await waitFor(() => expect(screen.getByTestId('cloud-terms-error')).toBeTruthy());
  // No toggles render without terms; submit stays gated.
  expect(screen.queryByTestId('cloud-accept-eula')).toBeNull();
  expect(submitDisabled()).toBe(true);
});

it('Cancel pops back without connecting', async () => {
  let posted = false;
  server.use(
    adminMe(),
    cloudTerms(),
    cloudConfig(disconnectedConfig),
    http.post('https://srv/api/settings/cloud/connect', () => {
      posted = true;
      return HttpResponse.json({ config: connectedConfig });
    }),
  );

  await act(async () => {
    renderTree(<CloudConnect />);
  });

  await waitFor(() => expect(screen.getByTestId('cloud-connect-cancel')).toBeTruthy());
  await act(async () => {
    fireEvent.press(screen.getByTestId('cloud-connect-cancel'));
  });

  expect(mockGoBack).toHaveBeenCalled();
  expect(posted).toBe(false);
});

it('the Connect button on the disconnected Cloud screen navigates to CloudConnect', async () => {
  server.use(adminMe(), cloudConfig(disconnectedConfig));

  await act(async () => {
    renderTree(<Cloud />);
  });

  await waitFor(() => expect(screen.getByTestId('cloud-connect')).toBeTruthy());
  await act(async () => {
    fireEvent.press(screen.getByTestId('cloud-connect'));
  });

  expect(mockNavigate).toHaveBeenCalledWith('CloudConnect');
});
