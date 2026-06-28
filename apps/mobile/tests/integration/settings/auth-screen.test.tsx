import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Auth from '@/screens/settings/Auth';
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
          <Auth />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

async function renderForwardAuth() {
  await renderAuth();
  // Wait for the OIDC form to settle (admin gate resolved), then switch tabs.
  await waitFor(() => expect(screen.getByTestId('auth-tab-forward')).toBeTruthy());
  await fireEvent.press(screen.getByTestId('auth-tab-forward'));
  await waitFor(() => expect(screen.getByTestId('fwd-user-header')).toBeTruthy());
}

it('surfaces an invalid_cidr 422 with the offending CIDR', async () => {
  server.use(
    http.get('https://srv/api/mobile/me', () =>
      HttpResponse.json({ id: 1, username: 'admin', email: null, displayName: null, role: 'admin' }),
    ),
    http.get('https://srv/api/auth/oidc/config', () => HttpResponse.json({ config: oidc })),
    http.get('https://srv/api/auth/forward-auth/config', () => HttpResponse.json({ config: fwd })),
    http.patch('https://srv/api/auth/forward-auth/config', () =>
      HttpResponse.json({ error: 'invalid_cidr', invalidCidrs: ['10.0.0.0/33'] }, { status: 422 }),
    ),
  );
  await renderForwardAuth();
  await fireEvent.press(screen.getByTestId('fwd-save'));
  const err = await screen.findByTestId('fwd-save-error');
  expect(err).toBeTruthy();
  expect(screen.getByText(/10\.0\.0\.0\/33/)).toBeTruthy();
});

it('gates the enable toggle until validation reports ready', async () => {
  server.use(
    http.get('https://srv/api/mobile/me', () =>
      HttpResponse.json({ id: 1, username: 'admin', email: null, displayName: null, role: 'admin' }),
    ),
    http.get('https://srv/api/auth/oidc/config', () => HttpResponse.json({ config: oidc })),
    http.get('https://srv/api/auth/forward-auth/config', () => HttpResponse.json({ config: fwd })),
    http.post('https://srv/api/auth/forward-auth/validate', () =>
      HttpResponse.json({
        ready: true,
        peerIp: '10.0.0.5',
        clientIp: '10.0.0.5',
        peerInTrustedProxies: true,
        userHeaderName: 'Remote-User',
        userHeaderPresent: true,
        userHeaderValue: 'paul',
      }),
    ),
  );
  await renderForwardAuth();

  // Locked: the gate helper is shown and pressing the toggle is a no-op.
  expect(screen.getByText('Validate the connection before enabling.')).toBeTruthy();
  const toggle = screen.getByTestId('fwd-enabled');
  expect(toggle.props.accessibilityState).toMatchObject({ checked: false });
  await fireEvent.press(toggle);
  expect(screen.getByTestId('fwd-enabled').props.accessibilityState).toMatchObject({
    checked: false,
  });

  // Validate → ready: the gate helper disappears and the toggle becomes settable.
  await fireEvent.press(screen.getByTestId('fwd-validate'));
  await waitFor(() => expect(screen.queryByText('Validate the connection before enabling.')).toBeNull());
  await fireEvent.press(screen.getByTestId('fwd-enabled'));
  expect(screen.getByTestId('fwd-enabled').props.accessibilityState).toMatchObject({
    checked: true,
  });
});

it('shows the validate diagnostic after a successful validation', async () => {
  server.use(
    http.get('https://srv/api/mobile/me', () =>
      HttpResponse.json({ id: 1, username: 'admin', email: null, displayName: null, role: 'admin' }),
    ),
    http.get('https://srv/api/auth/oidc/config', () => HttpResponse.json({ config: oidc })),
    http.get('https://srv/api/auth/forward-auth/config', () => HttpResponse.json({ config: fwd })),
    http.post('https://srv/api/auth/forward-auth/validate', () =>
      HttpResponse.json({
        ready: true,
        peerIp: '10.0.0.5',
        clientIp: '10.0.0.5',
        peerInTrustedProxies: true,
        userHeaderName: 'Remote-User',
        userHeaderPresent: true,
        userHeaderValue: 'paul',
      }),
    ),
  );
  await renderForwardAuth();
  await fireEvent.press(screen.getByTestId('fwd-validate'));
  const diag = await screen.findByTestId('fwd-validate-result');
  expect(diag).toBeTruthy();
  expect(screen.getByText('Connection ready')).toBeTruthy();
  expect(screen.getByText(/peer: 10\.0\.0\.5/)).toBeTruthy();
  expect(screen.getByText(/trusted: yes/)).toBeTruthy();
  expect(screen.getByText(/user header: present/)).toBeTruthy();
});

it('admin edits and saves the OIDC issuer', async () => {
  let patched: Record<string, unknown> | null = null;
  server.use(
    http.get('https://srv/api/mobile/me', () =>
      HttpResponse.json({ id: 1, username: 'admin', email: null, displayName: null, role: 'admin' }),
    ),
    http.get('https://srv/api/auth/oidc/config', () => HttpResponse.json({ config: oidc })),
    http.get('https://srv/api/auth/forward-auth/config', () => HttpResponse.json({ config: fwd })),
    http.patch('https://srv/api/auth/oidc/config', async ({ request }) => {
      patched = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ config: { ...oidc, issuer: 'https://new' } });
    }),
  );
  await renderAuth();
  await waitFor(() => expect(screen.getByTestId('oidc-issuer')).toBeTruthy());
  await fireEvent.changeText(screen.getByTestId('oidc-issuer'), 'https://new');
  await fireEvent.press(screen.getByTestId('oidc-save'));
  await waitFor(() => expect(patched?.issuer).toBe('https://new'));
  // Untouched secret must NOT be sent.
  expect(patched).not.toHaveProperty('clientSecret');
});
