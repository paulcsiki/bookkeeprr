import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Matcher from '@/screens/settings/Matcher';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/auth/AuthContext';
import { server } from '../../mocks/server';
import { fixtureReplayRuns, fixtureReplayDiffs } from '../../mocks/fixtures';
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

const matcherGet = () =>
  http.get('https://srv/api/settings/matcher', () =>
    HttpResponse.json({
      weights: {
        groupTopWeight: 100,
        groupStepDown: 10,
        batchBonus: 50,
        seederMultiplier: 5,
        trustedBonus: 25,
        remakePenalty: -30,
      },
      adultFilter: { enabled: false, blockedCategories: [] },
    }),
  );

// The replay list + run detail default handlers (tests/mocks/handlers.ts)
// already serve fixtureReplayRuns / fixtureReplayDiffs; tests that need an
// empty or failing list override them via server.use().

function renderScreen() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <Matcher />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

it('renders the replay history list from the fixture', async () => {
  server.use(adminMe(), matcherGet());

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('replay-history-list')).toBeTruthy(), { timeout: 10_000 });

  // Both fixture runs are listed, newest first, with run id, window, counts,
  // and a status badge.
  const completed = screen.getByTestId('replay-run-12');
  expect(completed).toHaveTextContent(/Run #12 — last 90d/);
  expect(completed).toHaveTextContent(/184 evaluated · 3 flipped · 21 rescored/);
  expect(completed).toHaveTextContent(/COMPLETED/);

  const failed = screen.getByTestId('replay-run-11');
  expect(failed).toHaveTextContent(/Run #11 — all retained/);
  expect(failed).toHaveTextContent(/FAILED/);
  expect(failed).toHaveTextContent(/release history table locked/);
});

it('opens a run detail sheet with per-release outcomes', async () => {
  server.use(adminMe(), matcherGet());

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('replay-run-12')).toBeTruthy(), { timeout: 10_000 });
  await act(async () => {
    fireEvent.press(screen.getByTestId('replay-run-12'));
  });

  await waitFor(() => expect(screen.getByTestId('replay-detail')).toBeTruthy(), { timeout: 10_000 });
  await waitFor(() => expect(screen.getByTestId('replay-detail-row-501')).toBeTruthy(), { timeout: 10_000 });

  // Flip into grabbing: old → new score plus the outcome label.
  const flippedIn = screen.getByTestId('replay-detail-row-501');
  expect(flippedIn).toHaveTextContent(/\[Ironworks\] Vinland Saga v05 \(2024\) \(Digital\)/);
  expect(flippedIn).toHaveTextContent(/12 → 91/);
  expect(flippedIn).toHaveTextContent(/now grabs/);

  // Flip out of grabbing.
  expect(screen.getByTestId('replay-detail-row-502')).toHaveTextContent(/no longer grabs/);

  // Plain rescore.
  expect(screen.getByTestId('replay-detail-row-503')).toHaveTextContent(/rescored/);

  // Adopted decision whose release row is gone → falls back to release #id.
  const adopted = screen.getByTestId('replay-detail-row-504');
  expect(adopted).toHaveTextContent(/release #9004/);
  expect(adopted).toHaveTextContent(/adopted/);

  expect(fixtureReplayDiffs.filter((d) => d.replayRunId === 12)).toHaveLength(4);
});

it('shows the empty state when no replays have run yet', async () => {
  server.use(
    adminMe(),
    matcherGet(),
    http.get('https://srv/api/settings/matcher/replays', () => HttpResponse.json({ runs: [] })),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByText('No replays yet')).toBeTruthy(), { timeout: 10_000 });
  expect(screen.queryByTestId('replay-history-list')).toBeNull();
});

it('shows an error state and recovers on retry', async () => {
  server.use(
    adminMe(),
    matcherGet(),
    http.get('https://srv/api/settings/matcher/replays', () =>
      HttpResponse.json({ error: 'boom' }, { status: 500 }),
    ),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByText("Couldn't load replay history")).toBeTruthy(), { timeout: 10_000 });
  expect(screen.queryByTestId('replay-history-list')).toBeNull();

  // Server recovers (most recent server.use wins) → Retry refetches the list.
  server.use(
    http.get('https://srv/api/settings/matcher/replays', () =>
      HttpResponse.json({ runs: fixtureReplayRuns }),
    ),
  );
  await act(async () => {
    fireEvent.press(screen.getByText('Retry'));
  });

  await waitFor(() => expect(screen.getByTestId('replay-history-list')).toBeTruthy(), { timeout: 10_000 });
  expect(screen.getByTestId('replay-run-12')).toBeTruthy();
});
