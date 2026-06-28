import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AutoGrab from '@/screens/settings/AutoGrab';
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

// GET /api/settings/auto-grab returns the config directly (not `{config}`-wrapped).
const autoGrabGet = (dryRun: boolean) =>
  http.get('https://srv/api/settings/auto-grab', () => HttpResponse.json({ dryRun }));

function renderScreen() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <AutoGrab />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

it('toggles dry-run and saves the PATCH body', async () => {
  let patchBody: Record<string, unknown> | null = null;
  server.use(
    adminMe(),
    autoGrabGet(false),
    http.patch('https://srv/api/settings/auto-grab', async ({ request }) => {
      patchBody = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ config: { dryRun: true } });
    }),
  );

  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('screen-auto-grab')).toBeTruthy());
  await waitFor(() => expect(screen.getByTestId('autograb-dryrun')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByTestId('autograb-dryrun'));
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId('autograb-save'));
  });

  await waitFor(() => expect(patchBody).not.toBeNull());
  expect(patchBody).toEqual({ dryRun: true });
});
