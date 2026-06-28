import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Housekeeping from '@/screens/settings/Housekeeping';
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

// GET /api/settings/housekeeping returns the four configs directly.
const housekeepingGet = () =>
  http.get('https://srv/api/settings/housekeeping', () =>
    HttpResponse.json({
      jobs: { terminalDays: 30, errorDays: 90 },
      backups: { daily: 14, monthlyDay1: 12 },
      visibility: { auditRetentionDays: 30, logRetentionDays: 7 },
      releases: { keepPerSeries: 30, olderThanDays: 90 },
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
          <Housekeeping />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

it('edits jobs terminalDays and PATCHes /jobs with the parsed value', async () => {
  let patchBody: Record<string, unknown> | null = null;
  server.use(
    adminMe(),
    housekeepingGet(),
    http.patch('https://srv/api/settings/housekeeping/jobs', async ({ request }) => {
      patchBody = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ config: { terminalDays: 45, errorDays: 90 } });
    }),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('screen-housekeeping')).toBeTruthy());
  await waitFor(() => expect(screen.getByTestId('hk-jobs-terminalDays')).toBeTruthy());

  // Seeded from the GET.
  expect(screen.getByTestId('hk-jobs-terminalDays').props.value).toBe('30');

  await act(async () => {
    fireEvent.changeText(screen.getByTestId('hk-jobs-terminalDays'), '45');
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId('hk-jobs-save'));
  });

  await waitFor(() => expect(patchBody).not.toBeNull());
  expect(patchBody).toEqual({ terminalDays: 45, errorDays: 90 });
});

it('edits releases keepPerSeries and PATCHes /releases with the correctly-named field', async () => {
  let patchBody: Record<string, unknown> | null = null;
  server.use(
    adminMe(),
    housekeepingGet(),
    http.patch('https://srv/api/settings/housekeeping/releases', async ({ request }) => {
      patchBody = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ config: { keepPerSeries: 50, olderThanDays: 90 } });
    }),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('screen-housekeeping')).toBeTruthy());
  await waitFor(() => expect(screen.getByTestId('hk-releases-keepPerSeries')).toBeTruthy());

  // Seeded from the GET.
  expect(screen.getByTestId('hk-releases-keepPerSeries').props.value).toBe('30');

  await act(async () => {
    fireEvent.changeText(screen.getByTestId('hk-releases-keepPerSeries'), '50');
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId('hk-releases-save'));
  });

  await waitFor(() => expect(patchBody).not.toBeNull());
  // Guards against section-key/field-name wiring bugs: must use keepPerSeries not terminalDays etc.
  expect(patchBody).toEqual({ keepPerSeries: 50, olderThanDays: 90 });
});

it('shows a field error and blocks the section save when a value is out of range', async () => {
  let patched = false;
  server.use(
    adminMe(),
    housekeepingGet(),
    http.patch('https://srv/api/settings/housekeeping/jobs', () => {
      patched = true;
      return HttpResponse.json({ config: { terminalDays: 30, errorDays: 90 } });
    }),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('hk-jobs-terminalDays')).toBeTruthy());

  // 0 is below the [1, 3650] range for terminalDays.
  await act(async () => {
    fireEvent.changeText(screen.getByTestId('hk-jobs-terminalDays'), '0');
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId('hk-jobs-save'));
  });

  await waitFor(() =>
    expect(screen.getByTestId('hk-jobs-terminalDays-error')).toBeTruthy(),
  );
  expect(patched).toBe(false);
});
