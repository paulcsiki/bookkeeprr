import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Logs from '@/screens/settings/Logs';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/auth/AuthContext';
import { server } from '../../mocks/server';
import { http, HttpResponse } from 'msw';

// Controllable layout: phone by default; the tablet test flips it to landscape.
let mockLayoutOverride: { isLandscape: boolean; isTablet: boolean } | null = null;
jest.mock('@/responsive/useLayout', () => {
  const actual = jest.requireActual('@/responsive/useLayout');
  return {
    ...actual,
    useLayout: () => {
      const base = actual.useLayout();
      if (!mockLayoutOverride) return base;
      return { ...base, ...mockLayoutOverride };
    },
  };
});

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

function mountFiles() {
  server.use(
    http.get('https://srv/api/mobile/me', () =>
      HttpResponse.json({ id: 1, username: 'admin', email: null, displayName: null, role: 'admin' }),
    ),
    http.get('https://srv/api/audit/logs/files', () =>
      HttpResponse.json({
        files: [
          { name: 'old.log', sizeBytes: 10, mtime: 100 },
          { name: 'newest.log', sizeBytes: 20, mtime: 200 },
        ],
      }),
    ),
    http.get('https://srv/api/audit/logs/files/newest.log', () =>
      HttpResponse.json({
        lines: [
          '{"level":50,"time":1,"component":"x","msg":"boom"}',
          'plain line',
        ],
        totalBytes: 2,
        hasMore: true,
        nextBefore: 0,
      }),
    ),
  );
}

function renderScreen() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <Logs />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

it('renders the logs screen, auto-selects the newest file, and parses lines', async () => {
  mountFiles();
  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByTestId('screen-logs')).toBeTruthy());
  // Newest file auto-selected → viewer mounts.
  await waitFor(() => expect(screen.getByTestId('log-viewer')).toBeTruthy());
  // Parsed pino line shows msg + ERR badge. ('ERR' also appears as a filter
  // pill, so assert at least one — the badge — is present.)
  await waitFor(() => expect(screen.getByText('boom')).toBeTruthy());
  expect(screen.getAllByText('ERR').length).toBeGreaterThanOrEqual(1);
  // Raw unparseable line shown verbatim.
  expect(screen.getByText('plain line')).toBeTruthy();
  // hasMore → load-earlier present.
  expect(screen.getByTestId('log-load-earlier')).toBeTruthy();
});

it('level filter pill hides non-matching lines', async () => {
  mountFiles();
  await act(async () => {
    renderScreen();
  });

  await waitFor(() => expect(screen.getByText('boom')).toBeTruthy());
  // Filter to INFO — the ERR line and the raw line should disappear.
  await act(async () => {
    fireEvent.press(screen.getByTestId('log-level-INFO'));
  });
  await waitFor(() => expect(screen.queryByText('boom')).toBeNull());
  expect(screen.queryByText('plain line')).toBeNull();
});

// Tail page (no `before`) returns the newest lines + hasMore/nextBefore; the
// `before=5` page returns older lines. Tapping load-earlier must PREPEND the
// older page while keeping the newest tail lines visible.
function mountPaged() {
  server.use(
    http.get('https://srv/api/mobile/me', () =>
      HttpResponse.json({ id: 1, username: 'admin', email: null, displayName: null, role: 'admin' }),
    ),
    http.get('https://srv/api/audit/logs/files', () =>
      HttpResponse.json({ files: [{ name: 'newest.log', sizeBytes: 20, mtime: 200 }] }),
    ),
    http.get('https://srv/api/audit/logs/files/newest.log', ({ request }) => {
      const url = new URL(request.url);
      const before = url.searchParams.get('before');
      if (before == null) {
        // The live tail page (no `before`).
        return HttpResponse.json({
          lines: ['tail-newest-1', 'tail-newest-2'],
          totalBytes: 2,
          hasMore: true,
          nextBefore: 5,
        });
      }
      if (before === '5') {
        // The first older page.
        return HttpResponse.json({
          lines: ['older-A', 'older-B'],
          totalBytes: 2,
          hasMore: false,
          nextBefore: 0,
        });
      }
      return HttpResponse.json({ lines: [], totalBytes: 0, hasMore: false, nextBefore: 0 });
    }),
  );
}

it('load earlier prepends the older page while keeping the newest tail lines', async () => {
  mountPaged();
  await act(async () => {
    renderScreen();
  });

  // Tail lines render first.
  await waitFor(() => expect(screen.getByText('tail-newest-1')).toBeTruthy());
  expect(screen.getByText('tail-newest-2')).toBeTruthy();

  // Page back.
  await act(async () => {
    fireEvent.press(screen.getByTestId('log-load-earlier'));
  });

  // Older lines now visible AND the newest tail lines are still present.
  await waitFor(() => expect(screen.getByText('older-A')).toBeTruthy());
  expect(screen.getByText('older-B')).toBeTruthy();
  expect(screen.getByText('tail-newest-1')).toBeTruthy();
  expect(screen.getByText('tail-newest-2')).toBeTruthy();
});

it('Live polling follows the tail (no before=) after paging back', async () => {
  // Record EVERY request to the log file (tail + historical) plus the tail-only
  // subset, so we can prove the poll targets the tail, not the page we paged to.
  const requests: string[] = [];
  const allRequests: string[] = [];
  mountPaged();
  server.use(
    http.get('https://srv/api/mobile/me', () =>
      HttpResponse.json({ id: 1, username: 'admin', email: null, displayName: null, role: 'admin' }),
    ),
    http.get('https://srv/api/audit/logs/files', () =>
      HttpResponse.json({ files: [{ name: 'newest.log', sizeBytes: 20, mtime: 200 }] }),
    ),
    http.get('https://srv/api/audit/logs/files/newest.log', ({ request }) => {
      allRequests.push(request.url);
      const before = new URL(request.url).searchParams.get('before');
      if (before == null) {
        requests.push(request.url);
        return HttpResponse.json({
          lines: ['tail-newest-1', 'tail-newest-2'],
          totalBytes: 2,
          hasMore: true,
          nextBefore: 5,
        });
      }
      return HttpResponse.json({
        lines: ['older-A', 'older-B'],
        totalBytes: 2,
        hasMore: false,
        nextBefore: 0,
      });
    }),
  );

  await act(async () => {
    renderScreen();
  });
  await waitFor(() => expect(screen.getByText('tail-newest-1')).toBeTruthy());

  // Page back to the historical page first.
  await act(async () => {
    fireEvent.press(screen.getByTestId('log-load-earlier'));
  });
  await waitFor(() => expect(screen.getByText('older-A')).toBeTruthy());

  // Switch to fake timers ONLY now (initial render + paging done with real
  // microtasks so MSW resolved cleanly), then drive the 3s poll interval.
  jest.useFakeTimers();
  try {
    const tailCountBefore = requests.length;
    const totalBefore = allRequests.length;
    await act(async () => {
      fireEvent.press(screen.getByTestId('log-live-toggle'));
    });
    await act(async () => {
      jest.advanceTimersByTime(3000);
      await Promise.resolve();
    });
    await waitFor(() => expect(requests.length).toBeGreaterThan(tailCountBefore));

    // The poll added ONLY tail requests — no new historical (before=) request.
    const newRequests = allRequests.slice(totalBefore);
    expect(newRequests.length).toBeGreaterThan(0);
    expect(newRequests.every((u) => !new URL(u).searchParams.has('before'))).toBe(true);
  } finally {
    jest.useRealTimers();
  }
});

it('renders the split layout on tablet landscape', async () => {
  // Force landscape via the mocked `useLayout` (same lever as the other tablet
  // integration tests, which fake the window dimensions / layout).
  mockLayoutOverride = { isLandscape: true, isTablet: true };
  try {
    mountFiles();
    await act(async () => {
      renderScreen();
    });
    await waitFor(() => expect(screen.getByTestId('logs-split')).toBeTruthy());
    expect(screen.getByTestId('logs-split-left')).toBeTruthy();
    expect(screen.getByTestId('logs-split-right')).toBeTruthy();
  } finally {
    mockLayoutOverride = null;
  }
});
