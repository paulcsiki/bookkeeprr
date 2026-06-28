import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/auth/AuthContext';
import { useCreateUser } from '@/api/hooks/useCreateUser';
import { useUpdateUser } from '@/api/hooks/useUpdateUser';
import { useResetUserPassword } from '@/api/hooks/useResetUserPassword';
import { useDeleteUser } from '@/api/hooks/useDeleteUser';
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

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return (
    <AuthProvider>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </AuthProvider>
  );
}

it('POSTs a new user', async () => {
  let received: unknown = null;
  server.use(
    http.post('https://srv/api/users', async ({ request }) => {
      received = await request.json();
      return HttpResponse.json({ user: { id: 9, username: 'kib', role: 'user' } }, { status: 201 });
    }),
  );
  const { result } = await renderHook(() => useCreateUser(), { wrapper });
  // Let AuthProvider hydrate creds asynchronously before mutating.
  await act(async () => {
    await Promise.resolve();
  });
  await waitFor(() => expect(result.current).not.toBeNull());
  await result.current.mutateAsync({ username: 'kib', password: 'password1', role: 'user', mustChangePassword: true });
  expect(received).toMatchObject({ username: 'kib', role: 'user' });
});

it('PATCHes an existing user', async () => {
  let captured: unknown = null;
  server.use(
    http.patch('https://srv/api/users/7', async ({ request }) => {
      captured = await request.json();
      return HttpResponse.json({ ok: true });
    }),
  );
  const { result } = await renderHook(() => useUpdateUser(), { wrapper });
  await act(async () => {
    await Promise.resolve();
  });
  await waitFor(() => expect(result.current).not.toBeNull());
  await result.current.mutateAsync({ id: 7, role: 'admin' });
  expect(captured).toMatchObject({ role: 'admin' });
});

it('POSTs a password reset', async () => {
  let captured: unknown = null;
  server.use(
    http.post('https://srv/api/users/7/reset-password', async ({ request }) => {
      captured = await request.json();
      return HttpResponse.json({ ok: true });
    }),
  );
  const { result } = await renderHook(() => useResetUserPassword(), { wrapper });
  await act(async () => {
    await Promise.resolve();
  });
  await waitFor(() => expect(result.current).not.toBeNull());
  await result.current.mutateAsync({ id: 7, newPassword: 'password1', mustChangePassword: true });
  expect(captured).toMatchObject({ newPassword: 'password1', mustChangePassword: true });
});

it('DELETEs a user', async () => {
  let deleted = false;
  server.use(
    http.delete('https://srv/api/users/7', () => {
      deleted = true;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const { result } = await renderHook(() => useDeleteUser(), { wrapper });
  await act(async () => {
    await Promise.resolve();
  });
  await waitFor(() => expect(result.current).not.toBeNull());
  await result.current.mutateAsync(7);
  expect(deleted).toBe(true);
});
