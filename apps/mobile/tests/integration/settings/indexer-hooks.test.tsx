import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/auth/AuthContext';
import { useIndexers } from '@/api/hooks/useIndexers';
import { useCreateIndexer } from '@/api/hooks/useCreateIndexer';
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
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  return (
    <AuthProvider>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </AuthProvider>
  );
}

it('GETs the indexers list', async () => {
  server.use(
    http.get('https://srv/api/indexers', () =>
      HttpResponse.json({
        indexers: [
          {
            id: 1,
            kind: 'nyaa',
            name: 'nyaa.si',
            baseUrl: 'https://nyaa.si',
            enabled: true,
            configJson:
              '{"kind":"nyaa","queryTemplate":"{title}","contentTypes":["manga"],"categoryByContentType":{"manga":"3_1"},"pollIntervalSeconds":900}',
            lastRssAt: null,
            lastSearchAt: null,
          },
        ],
      }),
    ),
  );
  const { result } = await renderHook(() => useIndexers(), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.indexers).toHaveLength(1);
  expect(result.current.data?.indexers[0]!.name).toBe('nyaa.si');
});

it('POSTs a new indexer with the create body', async () => {
  let received: unknown = null;
  server.use(
    http.post('https://srv/api/indexers', async ({ request }) => {
      received = await request.json();
      return HttpResponse.json({ id: 5 }, { status: 201 });
    }),
  );
  const { result } = await renderHook(() => useCreateIndexer(), { wrapper });
  await act(async () => {
    await Promise.resolve();
  });
  await waitFor(() => expect(result.current).not.toBeNull());
  const out = await result.current.mutateAsync({
    kind: 'torznab',
    name: 'My Torznab',
    baseUrl: 'https://torznab.example',
    enabled: true,
    configJson: {
      kind: 'torznab',
      queryTemplate: '{title}',
      contentTypes: ['ebook'],
      categoryByContentType: { ebook: '7020' },
      apiKey: 'secret',
      pollIntervalSeconds: 900,
    },
  });
  expect(out.id).toBe(5);
  expect(received).toMatchObject({
    kind: 'torznab',
    name: 'My Torznab',
    baseUrl: 'https://torznab.example',
    enabled: true,
  });
});
