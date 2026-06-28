import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AuthScreen from '@/screens/settings/Auth';
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

const oidc = {
  enabled: false,
  issuer: 'https://i',
  clientId: 'c',
  clientSecret: '••••••••',
  scopes: ['openid'],
  buttonLabel: 'SSO',
  usernameClaim: 'preferred_username',
  emailClaim: 'email',
  groupsClaim: 'groups',
  allowedGroups: [],
  adminGroups: [],
  autoCreateUsers: true,
};
const fwd = {
  enabled: false,
  trustedProxies: [],
  userHeader: 'Remote-User',
  emailHeader: 'Remote-Email',
  groupsHeader: 'Remote-Groups',
  autoCreateUsers: false,
  allowedGroups: [],
  adminGroups: [],
};

function renderAuth() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <AuthScreen />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

function adminEndpoints() {
  return [
    http.get('https://srv/api/mobile/me', () =>
      HttpResponse.json({ id: 1, username: 'admin', email: null, displayName: null, role: 'admin' }),
    ),
    http.get('https://srv/api/auth/oidc/config', () => HttpResponse.json({ config: oidc })),
    http.get('https://srv/api/auth/forward-auth/config', () => HttpResponse.json({ config: fwd })),
  ];
}

it('admin sees the segmented control and can switch to forward auth', async () => {
  server.use(...adminEndpoints());
  await renderAuth();
  await waitFor(() => expect(screen.getByTestId('oidc-issuer')).toBeTruthy());
  // Switch to forward auth and confirm its fields render.
  await fireEvent.press(screen.getByTestId('auth-tab-forward'));
  await waitFor(() => expect(screen.getByTestId('fwd-user-header')).toBeTruthy());
});

it('non-admin sees a read-only note instead of the forms', async () => {
  server.use(
    http.get('https://srv/api/mobile/me', () =>
      HttpResponse.json({ id: 2, username: 'sofia', email: null, displayName: null, role: 'user' }),
    ),
  );
  await renderAuth();
  await waitFor(() => expect(screen.getByTestId('auth-readonly-note')).toBeTruthy());
  expect(screen.queryByTestId('oidc-issuer')).toBeNull();
});
