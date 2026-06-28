// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReadingHeartbeat } from '@/components/reader/hooks/useReadingHeartbeat';

const HEARTBEAT_URL = '/api/reader/stats/heartbeat';

function posts(): Array<{ seconds: number; units: number }> {
  const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
  return fetchMock.mock.calls
    .filter(([url, init]) => url === HEARTBEAT_URL && (init as RequestInit | undefined)?.method === 'POST')
    .map(([, init]) => JSON.parse((init as RequestInit).body as string) as { seconds: number; units: number });
}

describe('useReadingHeartbeat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('POSTs accumulated active seconds every interval while active', () => {
    renderHook(() => useReadingHeartbeat({ isActive: true, intervalMs: 20_000 }));

    expect(posts()).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(20_000);
    });

    const sent = posts();
    expect(sent).toHaveLength(1);
    // ~20s of active time accumulated in the window.
    expect(sent[0]!.seconds).toBeGreaterThanOrEqual(18);
    expect(sent[0]!.seconds).toBeLessThanOrEqual(22);
  });

  it('does not POST while inactive', () => {
    renderHook(() => useReadingHeartbeat({ isActive: false, intervalMs: 20_000 }));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(posts()).toHaveLength(0);
  });

  it('flushes accumulated time on unmount with keepalive', () => {
    const { unmount } = renderHook(() =>
      useReadingHeartbeat({ isActive: true, intervalMs: 20_000 }),
    );

    act(() => {
      vi.advanceTimersByTime(8_000);
    });
    // Nothing posted yet (interval not reached).
    expect(posts()).toHaveLength(0);

    act(() => {
      unmount();
    });

    const sent = posts();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.seconds).toBeGreaterThanOrEqual(6);
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const lastCall = fetchMock.mock.calls.at(-1)!;
    expect((lastCall[1] as RequestInit).keepalive).toBe(true);
  });

  it('reports unit deltas from getUnitDelta', () => {
    let units = 0;
    renderHook(() =>
      useReadingHeartbeat({
        isActive: true,
        intervalMs: 20_000,
        getUnitDelta: () => {
          const d = units;
          units = 0;
          return d;
        },
      }),
    );

    act(() => {
      units = 5;
      vi.advanceTimersByTime(20_000);
    });

    expect(posts()[0]!.units).toBe(5);
  });

  it('does not POST when no active time accumulated', () => {
    const { unmount } = renderHook(() =>
      useReadingHeartbeat({ isActive: false, intervalMs: 20_000 }),
    );
    act(() => {
      unmount();
    });
    expect(posts()).toHaveLength(0);
  });
});
