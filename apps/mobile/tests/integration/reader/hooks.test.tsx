import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/auth/AuthContext';
import { useReaderManifest } from '@/api/hooks/useReaderManifest';
import { useReadingProgress } from '@/api/hooks/useReadingProgress';
import { useContinueReading } from '@/api/hooks/useContinueReading';
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

// useReadingProgress fires best-effort, fire-and-forget PUTs (sendNow) that are
// intentionally detached from the component lifecycle. Under RNTL v14's async
// render/cleanup, a PUT promise still settling when the test ends bleeds into
// the next test's renderHook act scope and leaves the freshly mounted hook's
// `result.current` unpopulated. Drain pending microtasks inside act after each
// test so every renderHook starts from a quiescent React state.
afterEach(async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
});

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

const MANIFEST = {
  readableKey: 'page:file:42',
  contentType: 'manga',
  reader: 'comics',
  format: 'cbz',
  title: 'Vinland Saga Vol. 1',
  author: 'Makoto Yukimura',
  seriesId: 7,
  volumeId: 3,
  coverUrl: 'https://srv/cover.jpg',
  volumeLabel: 'Vol. 1',
  pageCount: 200,
  progress: {
    readableKey: 'page:file:42',
    position: 0.25,
    locator: { page: 50 },
    finished: false,
    restartedFromFinish: false,
  },
};

describe('useReaderManifest', () => {
  it('fetches and parses a manifest by fileId', async () => {
    server.use(
      http.get(`${BASE}/api/reader/manifest`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('fileId')).toBe('42');
        return HttpResponse.json(MANIFEST);
      }),
    );
    const { result } = await renderHook(() => useReaderManifest({ fileId: 42 }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.readableKey).toBe('page:file:42');
    expect(result.current.data?.reader).toBe('comics');
    expect(result.current.data?.progress.position).toBe(0.25);
  });

  it('fetches by volumeId', async () => {
    server.use(
      http.get(`${BASE}/api/reader/manifest`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('volumeId')).toBe('9');
        return HttpResponse.json({
          ...MANIFEST,
          readableKey: 'audio:vol:9',
          reader: 'audio',
          format: 'audio',
        });
      }),
    );
    const { result } = await renderHook(() => useReaderManifest({ volumeId: 9 }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.readableKey).toBe('audio:vol:9');
  });
});

describe('useReadingProgress', () => {
  it('seeds nothing then issues a PUT with the server body when commit fires', async () => {
    let putBody: Record<string, unknown> | null = null;
    server.use(
      http.put(`${BASE}/api/reader/progress/:key`, async ({ request, params }) => {
        // MSW decodes path params, so this is the original (pre-encode) key.
        // Assert the encoded form against the raw URL instead.
        expect(new URL(request.url).pathname).toBe(
          `/api/reader/progress/${encodeURIComponent('page:file:42')}`,
        );
        expect(params.key).toBe('page:file:42');
        putBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          readableKey: 'page:file:42',
          position: putBody.position,
          locator: putBody.locator,
          finished: false,
        });
      }),
    );

    const { result } = await renderHook(
      () =>
        useReadingProgress('page:file:42', {
          seriesId: 7,
          volumeId: 3,
          contentType: 'manga',
          // Fire immediately so the test doesn't wait on the 800ms debounce.
          debounceMs: 0,
        }),
      { wrapper: makeWrapper() },
    );

    // AuthProvider loads creds asynchronously; let it settle to 'authenticated'
    // before committing so the mutation has a token.
    await act(async () => {
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current).not.toBeNull());
    // commit is fire-and-forget (no synchronous React state change), so it needs
    // no act() wrapper — wrapping it in a sync act() trips React 19's
    // "act without await" warning.
    result.current.commit(0.5, { page: 100 });

    await waitFor(() => expect(putBody).not.toBeNull());
    // DS11f added deviceId + deviceName to the progress PUT body.
    // deviceId is resolved async from AsyncStorage; the in-memory jest mock
    // generates a fresh UUID so we can't assert the exact value — assert the
    // shape instead. deviceName is Platform.OS-derived ('your iPhone' on ios).
    expect(putBody).toEqual(
      expect.objectContaining({
        position: 0.5,
        locator: { page: 100 },
        seriesId: 7,
        volumeId: 3,
        libraryFileId: 42,
        contentType: 'manga',
        deviceName: expect.any(String),
      }),
    );
    // deviceId is a UUID string or null (empty → null in the hook)
    const body = putBody!;
    const deviceId = body['deviceId'];
    expect(deviceId === null || typeof deviceId === 'string').toBe(true);
  });

  it('sends a finished read (>=0.999) immediately, bypassing the debounce', async () => {
    let putBody: Record<string, unknown> | null = null;
    server.use(
      http.put(`${BASE}/api/reader/progress/:key`, async ({ request }) => {
        putBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          readableKey: 'page:file:42',
          position: putBody.position,
          locator: putBody.locator,
          finished: true,
        });
      }),
    );
    const { result } = await renderHook(
      () =>
        useReadingProgress('page:file:42', {
          seriesId: 7,
          volumeId: 3,
          contentType: 'manga',
          // Huge debounce: only an immediate (finished) send could fire this.
          debounceMs: 100_000,
        }),
      { wrapper: makeWrapper() },
    );
    await act(async () => {
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current).not.toBeNull());
    result.current.commit(1, { page: 199 });

    await waitFor(() => expect(putBody).not.toBeNull());
    expect(putBody!.position).toBe(1);
  });

  it('flush() sends the latest pending position immediately (exit while debouncing)', async () => {
    let putBody: Record<string, unknown> | null = null;
    server.use(
      http.put(`${BASE}/api/reader/progress/:key`, async ({ request }) => {
        putBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          readableKey: 'page:file:42',
          position: putBody.position,
          locator: putBody.locator,
          finished: false,
        });
      }),
    );
    const { result } = await renderHook(
      () =>
        useReadingProgress('page:file:42', {
          seriesId: 7,
          volumeId: 3,
          contentType: 'manga',
          debounceMs: 100_000,
        }),
      { wrapper: makeWrapper() },
    );
    await act(async () => {
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current).not.toBeNull());
    result.current.commit(0.6, { page: 120 });
    // Debounced 100s out — nothing sent yet.
    expect(putBody).toBeNull();

    result.current.flush();
    await waitFor(() => expect(putBody).not.toBeNull());
    expect(putBody!.position).toBe(0.6);
  });
});

describe('useContinueReading', () => {
  it('fetches the continue-reading items', async () => {
    server.use(
      http.get(`${BASE}/api/reader/progress`, () =>
        HttpResponse.json({
          items: [
            {
              id: 1,
              userId: 1,
              readableKey: 'page:file:42',
              seriesId: 7,
              volumeId: 3,
              libraryFileId: 42,
              contentType: 'manga',
              position: 0.25,
              locatorJson: '{"page":50}',
              finished: false,
              createdAt: 1700000000000,
              updatedAt: 1700000000000,
              title: 'Vinland Saga',
              coverUrl: 'https://srv/c.jpg',
            },
          ],
        }),
      ),
    );
    const { result } = await renderHook(() => useContinueReading(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items).toHaveLength(1);
    expect(result.current.data?.items[0]?.readableKey).toBe('page:file:42');
    expect(result.current.data?.items[0]?.title).toBe('Vinland Saga');
  });
});
