import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/auth/AuthContext';
import { useReadingHeartbeat } from '@/api/hooks/useReadingHeartbeat';
import { server } from '../../mocks/server';

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

const BASE = 'https://srv';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AuthProvider>
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      </AuthProvider>
    );
  };
}

describe('useReadingHeartbeat', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('POSTs accumulated active seconds on the interval while active', async () => {
    const bodies: Array<{ seconds: number; units: number }> = [];
    server.use(
      http.post(`${BASE}/api/reader/stats/heartbeat`, async ({ request }) => {
        bodies.push((await request.json()) as { seconds: number; units: number });
        return HttpResponse.json({ ok: true });
      }),
    );

    let units = 0;
    await renderHook(
      () =>
        useReadingHeartbeat({
          isActive: true,
          intervalMs: 20_000,
          getUnitDelta: () => {
            const d = units;
            units = 0;
            return d;
          },
        }),
      { wrapper: makeWrapper() },
    );

    // Let AuthProvider settle to 'authenticated'.
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      units = 4;
      jest.advanceTimersByTime(20_000);
    });

    await waitFor(() => expect(bodies.length).toBeGreaterThanOrEqual(1));
    expect(bodies[0]!.seconds).toBeGreaterThanOrEqual(18);
    expect(bodies[0]!.seconds).toBeLessThanOrEqual(22);
    expect(bodies[0]!.units).toBe(4);
  });

  it('does not POST while inactive', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post(`${BASE}/api/reader/stats/heartbeat`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ ok: true });
      }),
    );

    await renderHook(() => useReadingHeartbeat({ isActive: false, intervalMs: 20_000 }), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });

    expect(bodies).toHaveLength(0);
  });
});
