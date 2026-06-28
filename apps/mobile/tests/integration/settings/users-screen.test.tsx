import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Users from '@/screens/settings/Users';
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

function renderUsers() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <Users />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

// Note: the create-user flow (POST body + server 409) moved to a dedicated
// pushed screen and is covered by create-user-screen.test.tsx. The Users screen
// now only navigates to it (asserted there too).

// --- UserActionsSheet --------------------------------------------------------

const adminMe = () =>
  http.get('https://srv/api/mobile/me', () =>
    HttpResponse.json({ id: 1, username: 'admin', email: null, displayName: null, role: 'admin' }),
  );

// One standard, enabled user (id 2) is enough to drive every action.
const usersList = () =>
  http.get('https://srv/api/users', () =>
    HttpResponse.json({
      users: [
        {
          id: 2,
          username: 'sofia',
          email: 'sofia@example.com',
          role: 'user',
          source: 'local',
          disabled: false,
          createdAt: '2026-02-12T00:00:00Z',
          lastLoginAt: null,
        },
      ],
    }),
  );

async function openActions(id: number) {
  await renderUsers();
  const btn = await screen.findByTestId(`user-actions-${id}`);
  await act(async () => {
    await fireEvent.press(btn);
  });
  await screen.findByTestId(`user-actions-sheet-${id}`);
}

it('delete needs two taps: first arms, second fires DELETE', async () => {
  let deleteCount = 0;
  server.use(
    adminMe(),
    usersList(),
    http.delete('https://srv/api/users/2', () => {
      deleteCount += 1;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  await openActions(2);

  // First tap: arms confirm, no DELETE.
  await act(async () => {
    await fireEvent.press(screen.getByTestId('ua-delete'));
  });
  expect(screen.getByText('Tap again to confirm delete')).toBeTruthy();
  expect(deleteCount).toBe(0);

  // Second tap: fires DELETE.
  await act(async () => {
    await fireEvent.press(screen.getByTestId('ua-delete'));
  });
  await waitFor(() => expect(deleteCount).toBe(1));
});

it('surfaces a 409 from a role toggle in the actions sheet', async () => {
  server.use(
    adminMe(),
    usersList(),
    http.patch('https://srv/api/users/2', () =>
      HttpResponse.json({ message: 'Cannot demote the last admin' }, { status: 409 }),
    ),
  );
  await openActions(2);
  await act(async () => {
    await fireEvent.press(screen.getByTestId('ua-role'));
  });
  await waitFor(() => expect(screen.getByTestId('user-actions-error')).toBeTruthy());
  expect(screen.getByText('Cannot demote the last admin')).toBeTruthy();
});

it('a 409 on delete resets the armed confirm state', async () => {
  server.use(
    adminMe(),
    usersList(),
    http.delete('https://srv/api/users/2', () =>
      HttpResponse.json({ message: 'You cannot delete yourself' }, { status: 409 }),
    ),
  );
  await openActions(2);

  // Arm.
  await act(async () => {
    await fireEvent.press(screen.getByTestId('ua-delete'));
  });
  expect(screen.getByText('Tap again to confirm delete')).toBeTruthy();

  // Confirm -> 409 -> error shown and confirm disarmed (label reverts).
  await act(async () => {
    await fireEvent.press(screen.getByTestId('ua-delete'));
  });
  await waitFor(() => expect(screen.getByTestId('user-actions-error')).toBeTruthy());
  expect(screen.getByText('You cannot delete yourself')).toBeTruthy();
  expect(screen.getByText('Delete user')).toBeTruthy();
  expect(screen.queryByText('Tap again to confirm delete')).toBeNull();
});

it('role toggle PATCHes the flipped role and closes the sheet on success', async () => {
  let body: unknown = null;
  server.use(
    adminMe(),
    usersList(),
    http.patch('https://srv/api/users/2', async ({ request }) => {
      body = await request.json();
      return new HttpResponse(null, { status: 204 });
    }),
  );
  await openActions(2);
  await act(async () => {
    await fireEvent.press(screen.getByTestId('ua-role'));
  });
  await waitFor(() => expect(body).toEqual({ role: 'admin' }));
  await waitFor(() => expect(screen.queryByTestId('user-actions-sheet-2')).toBeNull());
});

it('disable toggle PATCHes disabled:true and closes the sheet on success', async () => {
  let body: unknown = null;
  server.use(
    adminMe(),
    usersList(),
    http.patch('https://srv/api/users/2', async ({ request }) => {
      body = await request.json();
      return new HttpResponse(null, { status: 204 });
    }),
  );
  await openActions(2);
  await act(async () => {
    await fireEvent.press(screen.getByTestId('ua-disabled'));
  });
  await waitFor(() => expect(body).toEqual({ disabled: true }));
  await waitFor(() => expect(screen.queryByTestId('user-actions-sheet-2')).toBeNull());
});

// --- ResetPasswordSheet ------------------------------------------------------

async function openReset(id: number) {
  await openActions(id);
  await act(async () => {
    await fireEvent.press(screen.getByTestId('ua-reset'));
  });
  await screen.findByTestId('reset-password-sheet');
}

it('a too-short password blocks the POST and shows an error', async () => {
  let posted = false;
  server.use(
    adminMe(),
    usersList(),
    http.post('https://srv/api/users/2/reset-password', () => {
      posted = true;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  await openReset(2);
  await fireEvent.changeText(screen.getByTestId('rp-password'), 'short');
  await act(async () => {
    await fireEvent.press(screen.getByTestId('rp-submit'));
  });
  await waitFor(() =>
    expect(screen.getByText('Password must be at least 8 characters')).toBeTruthy(),
  );
  expect(posted).toBe(false);
});

it('a valid password POSTs newPassword and mustChangePassword', async () => {
  let body: unknown = null;
  server.use(
    adminMe(),
    usersList(),
    http.post('https://srv/api/users/2/reset-password', async ({ request }) => {
      body = await request.json();
      return new HttpResponse(null, { status: 204 });
    }),
  );
  await openReset(2);
  await fireEvent.changeText(screen.getByTestId('rp-password'), 'password1');
  await act(async () => {
    await fireEvent.press(screen.getByTestId('rp-submit'));
  });
  await waitFor(() =>
    expect(body).toEqual({ newPassword: 'password1', mustChangePassword: true }),
  );
});
