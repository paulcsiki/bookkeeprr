import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ApiAccess from '@/screens/settings/ApiAccess';
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

it('generates a key', async () => {
  server.use(
    http.get('https://srv/api/mobile/me', () =>
      HttpResponse.json({ id: 1, username: 'admin', email: null, displayName: null, role: 'admin' }),
    ),
    http.get('https://srv/api/settings/api-key', () =>
      HttpResponse.json({ enabled: false, key: '', createdAt: null }),
    ),
    http.patch('https://srv/api/settings/api-key', () =>
      HttpResponse.json({ enabled: true, key: 'secret-key-123', createdAt: '2026-06-09T00:00:00Z' }),
    ),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  await render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <ApiAccess />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('apikey-generate')).toBeTruthy());
  await fireEvent.press(screen.getByTestId('apikey-generate'));
  await waitFor(() => expect(screen.getByText('ENABLED')).toBeTruthy());
});

it('shows non-admin message for standard user', async () => {
  server.use(
    http.get('https://srv/api/mobile/me', () =>
      HttpResponse.json({ id: 2, username: 'user', email: null, displayName: null, role: 'user' }),
    ),
    http.get('https://srv/api/settings/api-key', () =>
      HttpResponse.json({ enabled: false, key: '', createdAt: null }),
    ),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  await render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <ApiAccess />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
  await waitFor(() =>
    expect(screen.getByText('API access requires an administrator account.')).toBeTruthy(),
  );
});

it('disable requires two taps — first tap shows confirm prompt, second tap fires PATCH', async () => {
  let patchBody: unknown = null;
  let patchCallCount = 0;

  server.use(
    http.get('https://srv/api/mobile/me', () =>
      HttpResponse.json({ id: 1, username: 'admin', email: null, displayName: null, role: 'admin' }),
    ),
    http.get('https://srv/api/settings/api-key', () =>
      HttpResponse.json({ enabled: true, key: 'secret-key-123', createdAt: '2026-06-09T00:00:00Z' }),
    ),
    http.patch('https://srv/api/settings/api-key', async ({ request }) => {
      patchCallCount += 1;
      patchBody = await request.json();
      return HttpResponse.json({ enabled: false, key: '', createdAt: null });
    }),
  );

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  await render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <ApiAccess />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );

  // Wait for the enabled state to render
  await waitFor(() => expect(screen.getByTestId('apikey-disable')).toBeTruthy());

  // First tap — confirm prompt should appear, NO patch yet
  await act(async () => {
    fireEvent.press(screen.getByTestId('apikey-disable'));
  });
  await waitFor(() => expect(screen.getByText('Tap again to confirm')).toBeTruthy());
  expect(patchCallCount).toBe(0);

  // Second tap — patch fires with {action:'disable'}, status flips to OFF
  await act(async () => {
    fireEvent.press(screen.getByTestId('apikey-disable'));
  });
  await waitFor(() => expect(patchCallCount).toBe(1));
  expect(patchBody).toEqual({ action: 'disable' });
  await waitFor(() => expect(screen.getByText('OFF')).toBeTruthy());
});

it('test result — ok path shows note text', async () => {
  server.use(
    http.get('https://srv/api/mobile/me', () =>
      HttpResponse.json({ id: 1, username: 'admin', email: null, displayName: null, role: 'admin' }),
    ),
    http.get('https://srv/api/settings/api-key', () =>
      HttpResponse.json({ enabled: true, key: 'secret-key-123', createdAt: '2026-06-09T00:00:00Z' }),
    ),
    http.post('https://srv/api/settings/api-key/test', () =>
      HttpResponse.json({ ok: true, note: 'auth disabled — any request would succeed' }),
    ),
  );

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  await render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <ApiAccess />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );

  await waitFor(() => expect(screen.getByTestId('apikey-test')).toBeTruthy());
  await act(async () => {
    fireEvent.press(screen.getByTestId('apikey-test'));
  });
  await waitFor(() => expect(screen.getByTestId('apikey-test-result')).toBeTruthy());
  expect(screen.getByText('auth disabled — any request would succeed')).toBeTruthy();
});

it('test result — error path shows error text', async () => {
  server.use(
    http.get('https://srv/api/mobile/me', () =>
      HttpResponse.json({ id: 1, username: 'admin', email: null, displayName: null, role: 'admin' }),
    ),
    http.get('https://srv/api/settings/api-key', () =>
      HttpResponse.json({ enabled: true, key: 'secret-key-123', createdAt: '2026-06-09T00:00:00Z' }),
    ),
    http.post('https://srv/api/settings/api-key/test', () =>
      HttpResponse.json({ ok: false, error: 'key mismatch' }, { status: 401 }),
    ),
  );

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  await render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <ApiAccess />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );

  await waitFor(() => expect(screen.getByTestId('apikey-test')).toBeTruthy());
  await act(async () => {
    fireEvent.press(screen.getByTestId('apikey-test'));
  });
  await waitFor(() => expect(screen.getByTestId('apikey-test-result')).toBeTruthy());
  expect(screen.getByText('key mismatch')).toBeTruthy();
});

it('reveal/hide toggles key visibility', async () => {
  server.use(
    http.get('https://srv/api/mobile/me', () =>
      HttpResponse.json({ id: 1, username: 'admin', email: null, displayName: null, role: 'admin' }),
    ),
    http.get('https://srv/api/settings/api-key', () =>
      HttpResponse.json({ enabled: true, key: 'secret-key-123', createdAt: '2026-06-09T00:00:00Z' }),
    ),
  );

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  await render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <ApiAccess />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );

  // Key is masked by default
  await waitFor(() => expect(screen.getByTestId('apikey-value')).toBeTruthy());
  expect(screen.getByText('••••••••••••••••')).toBeTruthy();
  expect(screen.queryByText('secret-key-123')).toBeNull();

  // Press reveal — key becomes visible
  await act(async () => {
    fireEvent.press(screen.getByTestId('apikey-reveal'));
  });
  await waitFor(() => expect(screen.getByText('secret-key-123')).toBeTruthy());
  expect(screen.queryByText('••••••••••••••••')).toBeNull();

  // Press again — key re-masks
  await act(async () => {
    fireEvent.press(screen.getByTestId('apikey-reveal'));
  });
  await waitFor(() => expect(screen.getByText('••••••••••••••••')).toBeTruthy());
  expect(screen.queryByText('secret-key-123')).toBeNull();
});
