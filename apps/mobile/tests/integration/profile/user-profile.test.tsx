import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import UserProfile from '@/screens/profile/UserProfile';
import Users from '@/screens/settings/Users';
import HomeDashboard from '@/screens/HomeDashboard';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/auth/AuthContext';
import { server } from '../../mocks/server';
import { fixtureUserProfile } from '../../mocks/fixtures';

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

const mockNavigate = jest.fn();
const mockPush = jest.fn();
const mockGoBack = jest.fn();
const mockTabNavigate = jest.fn();
const mockTabDispatch = jest.fn();
let mockRouteParams: Record<string, unknown> = {};
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      navigate: mockNavigate,
      push: mockPush,
      goBack: mockGoBack,
      getParent: () => ({ navigate: mockTabNavigate, dispatch: mockTabDispatch }),
    }),
    useRoute: () => ({ params: mockRouteParams, key: 'mock-route', name: 'UserProfile' }),
    useFocusEffect: (cb: () => void | (() => void)) => {
      cb();
    },
    useIsFocused: () => true,
    useNavigationState: () => undefined,
  };
});

function renderScreen(node: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>{node}</QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  mockNavigate.mockClear();
  mockTabDispatch.mockClear();
  mockPush.mockClear();
  mockGoBack.mockClear();
  mockTabNavigate.mockClear();
  mockRouteParams = {};
});

// ── profile rendering ────────────────────────────────────────

it('renders the member identity and lifetime reading stats', async () => {
  mockRouteParams = { userId: 2 };
  await renderScreen(<UserProfile />);

  await waitFor(() => expect(screen.getByTestId('profile-header')).toBeTruthy());

  // Identity: name, role badge, joined line — and no YOU badge (viewer is id 1).
  // (Name also appears in the member strip, hence getAllByText.)
  expect(screen.getAllByText('sofia').length).toBeGreaterThan(0);
  expect(screen.getByText('Member')).toBeTruthy();
  expect(screen.queryByTestId('profile-you-badge')).toBeNull();
  expect(screen.getByText('Joined Jan 2026')).toBeTruthy();
  expect(screen.getByText('Loves manga')).toBeTruthy();

  // Stat tiles: 5400 minutes → 90 hrs, 18 finished, rank #2 of 4 members.
  expect(screen.getAllByText(/^90/).length).toBeGreaterThan(0);
  expect(screen.getByText(/^18/)).toBeTruthy();
  expect(screen.getByText(/^#2/)).toBeTruthy();
  expect(screen.getAllByText(/of 4/).length).toBeGreaterThan(0);

  // Currently reading shelf with progress, both content types.
  expect(screen.getByText('Vinland Saga')).toBeTruthy();
  expect(screen.getByText('40%')).toBeTruthy();
  expect(screen.getAllByText('Dune Messiah').length).toBeGreaterThan(0);

  // Activity timeline verbs are content-type aware (audiobook → listening).
  expect(screen.getAllByText(/Finished/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Started listening to/).length).toBeGreaterThan(0);

  // Member strip lists the other members for profile switching.
  expect(screen.getByTestId('profile-member-1')).toBeTruthy();
});

it('marks your own profile with the YOU badge', async () => {
  mockRouteParams = { userId: 1 };
  await renderScreen(<UserProfile />);
  await waitFor(() => expect(screen.getByTestId('profile-header')).toBeTruthy());
  expect(screen.getByTestId('profile-you-badge')).toBeTruthy();
  expect(screen.getByText('Owner')).toBeTruthy();
});

it('tapping a member-strip chip pushes that profile', async () => {
  mockRouteParams = { userId: 2 };
  await renderScreen(<UserProfile />);
  await waitFor(() => expect(screen.getByTestId('profile-member-3')).toBeTruthy());
  fireEvent.press(screen.getByTestId('profile-member-3'));
  expect(mockPush).toHaveBeenCalledWith('UserProfile', { userId: 3 });
});

it('tapping a reading item opens the series in the Library tab', async () => {
  mockRouteParams = { userId: 2 };
  await renderScreen(<UserProfile />);
  await waitFor(() => expect(screen.getByTestId('profile-reading-1')).toBeTruthy());
  fireEvent.press(screen.getByTestId('profile-reading-1'));
  // openSeriesInLibrary seeds the Library stack with LibraryHome beneath the detail.
  expect(mockTabDispatch).toHaveBeenCalled();
  const action = mockTabDispatch.mock.calls[0][0];
  expect(action.payload.name).toBe('Library');
  expect(action.payload.params.state.routes.map((r: { name: string }) => r.name)).toEqual([
    'LibraryHome',
    'SeriesOverview',
  ]);
  expect(action.payload.params.state.routes[1].params).toEqual({ seriesId: '1' });
});

// ── error + retry ────────────────────────────────────────────

it('shows the error state on a 500 and recovers via Retry', async () => {
  mockRouteParams = { userId: 2 };
  let calls = 0;
  server.use(
    http.get('https://srv/api/profile/2', () => {
      calls += 1;
      if (calls === 1) return new HttpResponse(null, { status: 500 });
      return HttpResponse.json(fixtureUserProfile(2));
    }),
  );

  await renderScreen(<UserProfile />);
  await waitFor(() => expect(screen.getByTestId('profile-error')).toBeTruthy());
  expect(screen.getByText("Couldn't load profile")).toBeTruthy();

  fireEvent.press(screen.getByText('Retry'));
  await waitFor(() => expect(screen.getByTestId('profile-header')).toBeTruthy());
  expect(screen.getAllByText('sofia').length).toBeGreaterThan(0);
  expect(calls).toBe(2);
});

it('shows the error state when the member does not exist (404)', async () => {
  mockRouteParams = { userId: 99 };
  await renderScreen(<UserProfile />);
  await waitFor(() => expect(screen.getByTestId('profile-error')).toBeTruthy());
});

// ── entry points ─────────────────────────────────────────────

it('tapping a Users-list row navigates to that member profile', async () => {
  await renderScreen(<Users />);
  const row = await screen.findByTestId('user-row-2');
  fireEvent.press(row);
  expect(mockNavigate).toHaveBeenCalledWith('UserProfile', { userId: 2 });
});

it('renders volume label for a continue item with volumeNumber', async () => {
  mockRouteParams = { userId: 2 };
  await renderScreen(<UserProfile />);
  await waitFor(() => expect(screen.getByTestId('profile-reading-1')).toBeTruthy());
  // Vinland Saga is in continueItems with volumeNumber: 3 → "Vol. 3"
  expect(screen.getByText('Vol. 3')).toBeTruthy();
});

it('renders volume label for a finished item with volumeNumber', async () => {
  mockRouteParams = { userId: 2 };
  await renderScreen(<UserProfile />);
  await waitFor(() => expect(screen.getByTestId('profile-finished-2')).toBeTruthy());
  // Berserk in finished items with volumeNumber: 7 → "Vol. 7"
  expect(screen.getByText('Vol. 7')).toBeTruthy();
});

it('resolves relative cover URLs using serverUrl for reading tile', async () => {
  mockRouteParams = { userId: 2 };
  // Override fixture to use a relative cover URL
  server.use(
    http.get('https://srv/api/profile/2', () =>
      HttpResponse.json({
        ...fixtureUserProfile(2),
        continueItems: [
          {
            readableKey: 'page:file:42',
            title: 'Vinland Saga',
            contentType: 'manga',
            coverUrl: '/api/img/vs-cover.webp',
            pct: 40,
            seriesId: 1,
            volumeNumber: 3,
            volumeTitle: null,
          },
        ],
      }),
    ),
  );
  await renderScreen(<UserProfile />);
  await waitFor(() => expect(screen.getByTestId('profile-reading-1')).toBeTruthy());
  // The reading tile's <Cover> must receive the RESOLVED absolute URI
  // (serverUrl + the root-relative coverUrl), not the raw "/api/img/…" path —
  // resolving it is exactly the bug this fix closes. FastImage renders its
  // source.uri into the host tree; serialize it (dropping circular context/
  // provider props via a WeakSet) and assert the absolute URL is present and the
  // unresolved relative path is not.
  const seen = new WeakSet<object>();
  const tree = JSON.stringify(screen.toJSON(), (_k, v) => {
    if (typeof v === 'object' && v !== null) {
      if (seen.has(v)) return undefined;
      seen.add(v);
    }
    return v;
  });
  // Key on the `uri` prop specifically: the resolved absolute URL must be the
  // image source, and no image `uri` may carry the raw relative path. (The raw
  // path still appears elsewhere as the item's `coverUrl` DATA field — that's
  // fine; we assert about the image source, keyed on `"uri":`, not `"coverUrl":`.)
  expect(tree).toContain('"uri":"https://srv/api/img/vs-cover.webp"');
  expect(tree).not.toContain('"uri":"/api/img/vs-cover.webp"');
});

it('renders volume label for an activity item with volumeNumber', async () => {
  mockRouteParams = { userId: 2 };
  await renderScreen(<UserProfile />);
  await waitFor(() => expect(screen.getByTestId('profile-activity-1')).toBeTruthy());
  // Activity item 1 is "finished Berserk" with volumeNumber: 9 → "Vol. 9"
  expect(screen.getByText('Vol. 9')).toBeTruthy();
});

it('renders no volume label for activity items with null volumeNumber', async () => {
  mockRouteParams = { userId: 2 };
  await renderScreen(<UserProfile />);
  await waitFor(() => expect(screen.getByTestId('profile-activity-2')).toBeTruthy());
  // Activity item 1 (Berserk, volumeNumber:9) → "Vol. 9" renders once in the activity section.
  // Activity items 2 and 3 have volumeNumber: null, so no extra "Vol." text for them.
  // The rendered screen may also contain "Vol. 3" (reading tile) and "Vol. 7" (finished tile),
  // so we query specifically by the Dune Messiah activity ID and verify it has no text matching Vol.
  const act2 = screen.getByTestId('profile-activity-2');
  const act2Text = JSON.stringify(act2);
  expect(act2Text).not.toMatch(/Vol\./);
});

it('tapping a dashboard leaderboard row navigates to that member profile', async () => {
  server.use(
    http.get('https://srv/api/dashboard', () =>
      HttpResponse.json({
        period: 'week',
        greetingName: 'paul',
        memberCount: 3,
        continueItems: [],
        personal: {
          current: { minutes: 120, units: 4, booksFinished: 1, streakDays: 2 },
          previous: { minutes: 60, units: 2, booksFinished: 0, streakDays: 1 },
          distribution: [0, 0, 0, 0, 0],
          trend: [10, 20],
          favType: 'manga',
        },
        goals: { goals: {}, yearBooksDone: 0, weekMinutesDone: 0, streakDays: 0 },
        leaderboard: {
          time: [
            { userId: 1, displayName: 'paul', avatarUrl: null, role: 'admin', value: 300 },
            { userId: 2, displayName: 'sofia', avatarUrl: null, role: 'user', value: 200 },
          ],
          books: [],
          streak: [],
        },
        format: { byType: {}, totalMinutes: 0 },
        releases: [],
        server: { minutes: 0, booksFinished: 0, units: 0, activeReaders: 0, totalMembers: 3 },
        recent: [],
        feed: [],
      }),
    ),
    http.get('https://srv/api/dashboard/prefs', () =>
      HttpResponse.json({ order: [], enabled: {} }),
    ),
    http.get('https://srv/api/reader/progress', () => HttpResponse.json({ items: [] })),
  );

  await renderScreen(<HomeDashboard />);
  const row = await screen.findByTestId('leaderboard-row-2');
  fireEvent.press(row);
  expect(mockNavigate).toHaveBeenCalledWith('UserProfile', { userId: 2 });
});
