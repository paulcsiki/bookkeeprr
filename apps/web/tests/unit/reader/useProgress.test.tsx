// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { type PropsWithChildren } from 'react';
import type { ReaderManifest, ReaderLocator } from '@bookkeeprr/types';
import { useProgress } from '@/components/reader/hooks/useProgress';

function makeManifest(): ReaderManifest {
  return {
    readableKey: 'page:file:42',
    contentType: 'comic',
    reader: 'comics',
    format: 'cbz',
    title: 'Test',
    seriesId: 7,
    volumeId: 3,
    pageCount: 20,
    progress: {
      readableKey: 'page:file:42',
      position: 0,
      locator: null,
      finished: false,
      restartedFromFinish: false,
    },
  };
}

function wrapper({ children }: PropsWithChildren): React.JSX.Element {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const loc: ReaderLocator = { page: 1 };

describe('useProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            readableKey: 'page:file:42',
            position: 0.2,
            locator: { page: 4 },
            finished: false,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('debounces rapid commits into a single PUT with the latest position', async () => {
    const { result } = renderHook(() => useProgress(makeManifest()), { wrapper });

    act(() => {
      result.current.commit(0.1, loc);
      result.current.commit(0.2, { page: 4 });
    });

    // Optimistic local position reflects the latest immediately.
    expect(result.current.position).toBeCloseTo(0.2);

    // No PUT before the debounce window elapses.
    expect(fetch).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const puts = fetchMock.mock.calls.filter(
      (c) => (c[1] as RequestInit | undefined)?.method === 'PUT',
    );
    expect(puts).toHaveLength(1);

    const [url, init] = puts[0] as [string, RequestInit];
    expect(url).toBe('/api/reader/progress/' + encodeURIComponent('page:file:42'));
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.position).toBeCloseTo(0.2);
    expect(body.seriesId).toBe(7);
    expect(body.volumeId).toBe(3);
    expect(body.libraryFileId).toBe(42);
    expect(body.contentType).toBe('comic');
    expect(body.locator).toEqual({ page: 4 });
  });

  it('seeds position from the manifest progress', () => {
    const m = makeManifest();
    m.progress.position = 0.55;
    const { result } = renderHook(() => useProgress(m), { wrapper });
    expect(result.current.position).toBeCloseTo(0.55);
  });

  it('exposes finished / restartedFromFinish from the manifest', () => {
    const m = makeManifest();
    m.progress.finished = true;
    m.progress.restartedFromFinish = true;
    const { result } = renderHook(() => useProgress(m), { wrapper });
    expect(result.current.finished).toBe(true);
    expect(result.current.restartedFromFinish).toBe(true);
  });
});
