import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Updates from '@/screens/settings/Updates';
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

const defaultConfig = {
  frequency: 'daily' as const,
  behavior: 'notify' as const,
  notifyOnIntegrations: false,
  showChangelogOnFirstLaunch: true,
};

const defaultState = {
  latestVersion: null,
  latestReleaseUrl: null,
  latestReleaseBody: null,
  latestPublishedAt: null,
  fetchedAt: null,
  fetchError: null,
};

const defaultBuildInfo = {
  version: '1.2.3',
  commit: 'abc1234',
  builtAt: '2026-06-01T00:00:00Z',
  channel: 'stable',
  runtime: 'Node 22 · Next 16 · React 19',
  uptime: 100,
};

// GET /api/updates is the real combined-overview route the screen loads from.
const updatesOverview = (deploymentMode: 'auto' | 'docker' | 'kubernetes' = 'docker') =>
  http.get('https://srv/api/updates', () =>
    HttpResponse.json({
      buildInfo: defaultBuildInfo,
      state: defaultState,
      config: defaultConfig,
      deploymentMode,
      updateAvailable: false,
      lastSeenVersion: null,
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
          <Updates />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

it('loads config + deployment mode from the overview and saves only the dirty diff', async () => {
  let patchBody: Record<string, unknown> | null = null;
  server.use(
    adminMe(),
    // Server's effective deployment mode is "docker" — the control must reflect it.
    updatesOverview('docker'),
    http.patch('https://srv/api/settings/updates', async ({ request }) => {
      patchBody = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ config: { ...defaultConfig, ...patchBody } });
    }),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('screen-updates')).toBeTruthy());
  await waitFor(() => expect(screen.getByTestId('updates-frequency-weekly')).toBeTruthy());

  // Config loaded: server's "daily" frequency is reflected as selected.
  expect(
    screen.getByTestId('updates-frequency-daily').props.accessibilityState.selected,
  ).toBe(true);

  // Deployment-mode control reflects the server's effective mode ("docker"),
  // not a hardcoded "auto".
  expect(
    screen.getByTestId('updates-deployment-docker').props.accessibilityState.selected,
  ).toBe(true);
  expect(
    screen.getByTestId('updates-deployment-auto').props.accessibilityState.selected,
  ).toBe(false);

  await act(async () => {
    fireEvent.press(screen.getByTestId('updates-frequency-weekly'));
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId('updates-save'));
  });

  await waitFor(() => expect(patchBody).not.toBeNull());
  // Only the dirty field is PATCHed to /api/settings/updates.
  expect(patchBody).toEqual({ frequency: 'weekly' });
});

it('Check now renders the latest version from a mocked {state}', async () => {
  server.use(
    adminMe(),
    updatesOverview(),
    http.post('https://srv/api/updates/check', () =>
      HttpResponse.json({
        state: {
          latestVersion: 'v9.9.9',
          latestReleaseUrl: 'https://x',
          latestReleaseBody: 'notes',
          latestPublishedAt: '2026-06-09T00:00:00Z',
          fetchedAt: '2026-06-09T00:00:00Z',
          fetchError: null,
        },
      }),
    ),
  );

  await act(async () => {
    renderScreen();
  });
  await waitFor(() => expect(screen.getByTestId('updates-check-now')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByTestId('updates-check-now'));
  });

  await waitFor(() => expect(screen.getByText(/v9\.9\.9/)).toBeTruthy());
});

it('Check now shows the rate-limit note on 429', async () => {
  server.use(
    adminMe(),
    updatesOverview(),
    http.post('https://srv/api/updates/check', () =>
      HttpResponse.json({ error: 'rate-limited', retryAfterSeconds: 42 }, { status: 429 }),
    ),
  );

  await act(async () => {
    renderScreen();
  });
  await waitFor(() => expect(screen.getByTestId('updates-check-now')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByTestId('updates-check-now'));
  });

  await waitFor(() => expect(screen.getByTestId('updates-check-ratelimit')).toBeTruthy());
});
