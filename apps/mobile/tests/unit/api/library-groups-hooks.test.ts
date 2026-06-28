import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import React from 'react';
import { AuthProvider } from '@/auth/AuthContext';
import { useGroupMutations } from '@/api/hooks/useGroupMutations';
import { useMoveSeriesToGroup } from '@/api/hooks/useMoveSeriesToGroup';

jest.mock('@/auth/token-store', () => ({
  tokenStore: {
    load: jest.fn().mockResolvedValue({
      serverUrl: 'https://srv',
      token: 't',
      refreshToken: 'r',
      expiresAt: '2026-08-25T00:00:00Z',
      certFingerprint: null,
    }),
    save: jest.fn(),
    clear: jest.fn(),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return React.createElement(
    AuthProvider,
    null,
    React.createElement(QueryClientProvider, { client: qc }, children),
  );
}

function mockFetch(responseBody: unknown, status = 200): jest.Mock {
  const mock = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => responseBody,
  });
  (globalThis as unknown as { fetch: jest.Mock }).fetch = mock;
  return mock;
}

const WAIT_OPTS = { timeout: 5000 } as const;

describe('useGroupMutations', () => {
  it('createGroup({name:"Foo", parentId:null}) sends body with NO parentId key', async () => {
    const fetchMock = mockFetch({ id: 1, name: 'Foo', parentId: null, path: 'Foo', seriesCount: 0, subgroupCount: 0 });

    const { result } = await renderHook(() => useGroupMutations(), { wrapper });
    await waitFor(() => expect(result.current.createGroup).toBeDefined(), WAIT_OPTS);

    await act(async () => {
      await result.current.createGroup.mutateAsync({ name: 'Foo', parentId: null });
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).not.toHaveProperty('parentId');
    expect(body.name).toBe('Foo');
  });

  it('createGroup({name:"Sub", parentId:3}) sends body with parentId: 3', async () => {
    const fetchMock = mockFetch({ id: 2, name: 'Sub', parentId: 3, path: 'Root / Sub', seriesCount: 0, subgroupCount: 0 });

    const { result } = await renderHook(() => useGroupMutations(), { wrapper });
    await waitFor(() => expect(result.current.createGroup).toBeDefined(), WAIT_OPTS);

    await act(async () => {
      await result.current.createGroup.mutateAsync({ name: 'Sub', parentId: 3 });
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toHaveProperty('parentId', 3);
    expect(body.name).toBe('Sub');
  });

  it('deleteGroup parses {deletedGroups, deletedSeries} from the response', async () => {
    mockFetch({ deletedGroups: 2, deletedSeries: 5 });

    const { result } = await renderHook(() => useGroupMutations(), { wrapper });
    await waitFor(() => expect(result.current.deleteGroup).toBeDefined(), WAIT_OPTS);

    let parsed: { deletedGroups: number; deletedSeries: number } | undefined;
    await act(async () => {
      parsed = await result.current.deleteGroup.mutateAsync({ id: 4 });
    });

    expect(parsed).toEqual({ deletedGroups: 2, deletedSeries: 5 });
  });
});

describe('useMoveSeriesToGroup', () => {
  it('PATCHes /api/series/7 with {groupId: null} when ungrouping', async () => {
    const fetchMock = mockFetch({ id: 7 });

    const { result } = await renderHook(() => useMoveSeriesToGroup(), { wrapper });
    await waitFor(() => expect(result.current.mutateAsync).toBeDefined(), WAIT_OPTS);

    await act(async () => {
      await result.current.mutateAsync({ seriesId: 7, groupId: null });
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://srv/api/series/7');
    expect((init as RequestInit & { method: string }).method).toBe('PATCH');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toHaveProperty('groupId', null);
  });
});
