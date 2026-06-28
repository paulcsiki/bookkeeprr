import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/auth/AuthContext';
import { useOidcConfig } from '@/api/hooks/useOidcConfig';
import { useTestOidc } from '@/api/hooks/useTestOidc';
import { useTestApiKey } from '@/api/hooks/useTestApiKey';
import { useUpdateForwardAuthConfig } from '@/api/hooks/useUpdateForwardAuthConfig';
import { useMutateApiKey } from '@/api/hooks/useMutateApiKey';
import { ApiError } from '@/api/client';
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
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return (
    <AuthProvider>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </AuthProvider>
  );
}

it('loads OIDC config', async () => {
  server.use(
    http.get('https://srv/api/auth/oidc/config', () =>
      HttpResponse.json({
        config: {
          enabled: true,
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
        },
      }),
    ),
  );
  const { result } = await renderHook(() => useOidcConfig(), { wrapper });
  // Let AuthProvider hydrate creds asynchronously before querying.
  await act(async () => {
    await Promise.resolve();
  });
  await waitFor(() => expect(result.current.data?.config.issuer).toBe('https://i'));
});

it('useTestOidc resolves (not rejects) on a 502 whose body is the error result', async () => {
  server.use(
    http.post('https://srv/api/auth/oidc/test', () =>
      HttpResponse.json(
        { ok: false, error: 'discovery_failed', detail: 'bad issuer' },
        { status: 502 },
      ),
    ),
  );
  const { result } = await renderHook(() => useTestOidc(), { wrapper });
  await act(async () => {
    await Promise.resolve();
  });
  await waitFor(() => expect(result.current).not.toBeNull());
  const resolved = await result.current.mutateAsync({
    issuer: 'https://bad-issuer',
    clientId: 'c',
    clientSecret: 's',
  });
  expect(resolved).toMatchObject({ ok: false, error: 'discovery_failed' });
});

it('useTestOidc resolves with ok:true on a happy-path 200', async () => {
  server.use(
    http.post('https://srv/api/auth/oidc/test', () =>
      HttpResponse.json({
        ok: true,
        issuer: 'https://idp',
        authorizationEndpoint: 'https://idp/auth',
        tokenEndpoint: 'https://idp/token',
        jwksUri: 'https://idp/.well-known/jwks.json',
      }),
    ),
  );
  const { result } = await renderHook(() => useTestOidc(), { wrapper });
  await act(async () => {
    await Promise.resolve();
  });
  await waitFor(() => expect(result.current).not.toBeNull());
  const resolved = await result.current.mutateAsync({
    issuer: 'https://idp',
    clientId: 'c',
    clientSecret: 's',
  });
  expect(resolved).toMatchObject({ ok: true, issuer: 'https://idp' });
});

it('useTestApiKey resolves (not rejects) on a 401 whose body is the error result', async () => {
  server.use(
    http.post('https://srv/api/settings/api-key/test', () =>
      HttpResponse.json({ ok: false, error: 'key mismatch' }, { status: 401 }),
    ),
  );
  const { result } = await renderHook(() => useTestApiKey(), { wrapper });
  await act(async () => {
    await Promise.resolve();
  });
  await waitFor(() => expect(result.current).not.toBeNull());
  const resolved = await result.current.mutateAsync();
  expect(resolved).toMatchObject({ ok: false, error: 'key mismatch' });
});

it('useUpdateForwardAuthConfig propagates a 422 as ApiError (does not swallow)', async () => {
  server.use(
    http.patch('https://srv/api/auth/forward-auth/config', () =>
      HttpResponse.json(
        { error: 'invalid_cidr', invalidCidrs: ['bad'] },
        { status: 422 },
      ),
    ),
  );
  const { result } = await renderHook(() => useUpdateForwardAuthConfig(), { wrapper });
  await act(async () => {
    await Promise.resolve();
  });
  await waitFor(() => expect(result.current).not.toBeNull());
  let caught: unknown;
  try {
    await result.current.mutateAsync({ trustedProxies: ['bad'] });
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(ApiError);
  expect((caught as ApiError).body).toEqual({ error: 'invalid_cidr', invalidCidrs: ['bad'] });
});

it('useMutateApiKey writes the returned state into the [api-key] query cache', async () => {
  const apiKeyResponse = { enabled: true, key: 'k', createdAt: '2026-06-09T00:00:00Z' };
  server.use(
    http.patch('https://srv/api/settings/api-key', () =>
      HttpResponse.json(apiKeyResponse),
    ),
  );
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const sharedWrapper = ({ children }: { children: ReactNode }) => (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </AuthProvider>
  );
  const { result } = await renderHook(() => useMutateApiKey(), { wrapper: sharedWrapper });
  await act(async () => {
    await Promise.resolve();
  });
  await waitFor(() => expect(result.current).not.toBeNull());
  await result.current.mutateAsync('generate');
  expect(queryClient.getQueryData(['api-key'])).toEqual(apiKeyResponse);
});
