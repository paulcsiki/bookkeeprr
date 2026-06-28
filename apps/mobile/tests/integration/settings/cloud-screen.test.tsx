import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

const adminMe = () =>
  http.get('https://srv/api/mobile/me', () =>
    HttpResponse.json({ id: 1, username: 'admin', email: null, displayName: null, role: 'admin' }),
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

function renderScreen() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <Cloud />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

// Connect-flow coverage (toggle gating, version POST body, server error)
// lives in cloud-connect-screen.test.tsx — connect is now a pushed screen, not
// an inline sheet. This suite covers the host Cloud screen (connected state,
// disconnect flow, and the non-admin gate).

it('connected → disconnect: confirm then disconnect flips to disconnected and shows devicesRemoved', async () => {
  let cloudCalls = 0;
  let disconnectCalls = 0;
  server.use(
    adminMe(),
    http.get('https://srv/api/settings/cloud', () => {
      cloudCalls += 1;
      return HttpResponse.json({ config: cloudCalls === 1 ? connectedConfig : disconnectedConfig });
    }),
    http.post('https://srv/api/settings/cloud/disconnect', () => {
      disconnectCalls += 1;
      return HttpResponse.json({ devicesRemoved: 3, config: disconnectedConfig });
    }),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('cloud-status')).toBeTruthy());
  await waitFor(() => expect(screen.getByTestId('cloud-disconnect')).toBeTruthy());

  // First tap → confirm; NO request yet.
  await act(async () => {
    fireEvent.press(screen.getByTestId('cloud-disconnect'));
  });
  expect(disconnectCalls).toBe(0);

  // Second tap → disconnect fires.
  await act(async () => {
    fireEvent.press(screen.getByTestId('cloud-disconnect'));
  });
  await waitFor(() => expect(disconnectCalls).toBe(1));

  // Flips to disconnected (Connect button reappears).
  await waitFor(() => expect(screen.getByTestId('cloud-connect')).toBeTruthy());
  // devicesRemoved surfaced.
  await waitFor(() => expect(screen.getByText(/3/)).toBeTruthy());
});

it('shows non-admin message for standard user', async () => {
  server.use(
    http.get('https://srv/api/mobile/me', () =>
      HttpResponse.json({ id: 2, username: 'user', email: null, displayName: null, role: 'user' }),
    ),
  );
  await act(async () => {
    renderScreen();
  });
  await waitFor(() =>
    expect(screen.getByText('Cloud connection requires an administrator account.')).toBeTruthy(),
  );
});
