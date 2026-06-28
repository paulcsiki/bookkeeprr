import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Matcher from '@/screens/settings/Matcher';
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

// Combined GET returns { weights, adultFilter }.
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
        minSeeders: 1,
      },
      adultFilter: { enabled: false, blockedCategories: ['hentai'] },
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
          <Matcher />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

it('edits groupTopWeight and PATCHes /weights with the parsed number', async () => {
  let patchBody: Record<string, unknown> | null = null;
  server.use(
    adminMe(),
    matcherGet(),
    http.patch('https://srv/api/settings/matcher/weights', async ({ request }) => {
      patchBody = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({
        config: {
          groupTopWeight: 200,
          groupStepDown: 10,
          batchBonus: 50,
          seederMultiplier: 5,
          trustedBonus: 25,
          remakePenalty: -30,
        },
      });
    }),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('screen-matcher')).toBeTruthy());
  await waitFor(() => expect(screen.getByTestId('matcher-weight-groupTopWeight')).toBeTruthy());

  // Seeded from the GET.
  expect(screen.getByTestId('matcher-weight-groupTopWeight').props.value).toBe('100');

  await act(async () => {
    fireEvent.changeText(screen.getByTestId('matcher-weight-groupTopWeight'), '200');
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId('matcher-weights-save'));
  });

  await waitFor(() => expect(patchBody).not.toBeNull());
  expect(patchBody).toEqual({
    groupTopWeight: 200,
    groupStepDown: 10,
    batchBonus: 50,
    seederMultiplier: 5,
    trustedBonus: 25,
    remakePenalty: -30,
    minSeeders: 1,
  });
});

it('blocks the weights save and shows a field error when a value is out of range', async () => {
  let patched = false;
  server.use(
    adminMe(),
    matcherGet(),
    http.patch('https://srv/api/settings/matcher/weights', () => {
      patched = true;
      return HttpResponse.json({ config: {} });
    }),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('matcher-weight-groupTopWeight')).toBeTruthy());

  // 5000 is above the [0, 1000] range for groupTopWeight.
  await act(async () => {
    fireEvent.changeText(screen.getByTestId('matcher-weight-groupTopWeight'), '5000');
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId('matcher-weights-save'));
  });

  await waitFor(() =>
    expect(screen.getByTestId('matcher-weight-groupTopWeight-error')).toBeTruthy(),
  );
  expect(patched).toBe(false);
});

it('accepts a negative remakePenalty and saves it', async () => {
  let patchBody: Record<string, unknown> | null = null;
  server.use(
    adminMe(),
    matcherGet(),
    http.patch('https://srv/api/settings/matcher/weights', async ({ request }) => {
      patchBody = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({
        config: {
          groupTopWeight: 100,
          groupStepDown: 10,
          batchBonus: 50,
          seederMultiplier: 5,
          trustedBonus: 25,
          remakePenalty: -20,
        },
      });
    }),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('matcher-weight-remakePenalty')).toBeTruthy());
  expect(screen.getByTestId('matcher-weight-remakePenalty').props.value).toBe('-30');

  await act(async () => {
    fireEvent.changeText(screen.getByTestId('matcher-weight-remakePenalty'), '-20');
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId('matcher-weights-save'));
  });

  await waitFor(() => expect(patchBody).not.toBeNull());
  expect(patchBody).toMatchObject({ remakePenalty: -20 });
});

it('saves the adult filter PATCHing /adult-filter with { enabled, blockedCategories }', async () => {
  let patchBody: Record<string, unknown> | null = null;
  server.use(
    adminMe(),
    matcherGet(),
    http.patch('https://srv/api/settings/matcher/adult-filter', async ({ request }) => {
      patchBody = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ config: { enabled: true, blockedCategories: ['hentai'] } });
    }),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('matcher-adult-enabled')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByTestId('matcher-adult-enabled'));
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId('matcher-adult-save'));
  });

  await waitFor(() => expect(patchBody).not.toBeNull());
  expect(patchBody).toEqual({ enabled: true, blockedCategories: ['hentai'] });
});

it('surfaces an auto-replay run id after saving weights', async () => {
  server.use(
    adminMe(),
    matcherGet(),
    http.patch('https://srv/api/settings/matcher/weights', () =>
      HttpResponse.json({
        config: {
          groupTopWeight: 200,
          groupStepDown: 10,
          batchBonus: 50,
          seederMultiplier: 5,
          trustedBonus: 25,
          remakePenalty: -30,
        },
        autoReplayEnqueued: { runId: 5 },
      }),
    ),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('matcher-weight-groupTopWeight')).toBeTruthy());

  await act(async () => {
    fireEvent.changeText(screen.getByTestId('matcher-weight-groupTopWeight'), '200');
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId('matcher-weights-save'));
  });

  await waitFor(() => expect(screen.getByTestId('matcher-replay-result')).toBeTruthy());
  expect(screen.getByTestId('matcher-replay-result')).toHaveTextContent('Replay queued (#5)');
});
