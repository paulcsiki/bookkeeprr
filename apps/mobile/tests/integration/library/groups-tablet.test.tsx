import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import Library from '@/screens/library/LibraryHome';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/auth/AuthContext';
import { useLibraryFilter } from '@/state/libraryFilterStore';
import { server } from '../../mocks/server';
import { fixtureSeries } from '../../mocks/fixtures';

// Tablet-landscape viewport (jest can't exercise real pan gestures — the
// drag wiring itself is device-verified; this suite covers the tablet
// browse chrome: folder cards, crumbs, New group button, phone UI absent).
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 1180, height: 820 }),
}));

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

// Shonen (root) ⊃ Classics. Vinland Saga sits in Shonen, Berserk in Classics,
// everything else stays ungrouped (mirrors groups-browse.test.tsx).
const GROUPS = [
  { id: 1, name: 'Shonen', parentId: null, path: 'Shonen', seriesCount: 2, subgroupCount: 1 },
  {
    id: 2,
    name: 'Classics',
    parentId: 1,
    path: 'Shonen / Classics',
    seriesCount: 1,
    subgroupCount: 0,
  },
];

const ROWS = fixtureSeries.map((s) =>
  s.title === 'Vinland Saga'
    ? { ...s, groupId: 1, groupPath: 'Shonen' }
    : s.title === 'Berserk'
      ? { ...s, groupId: 2, groupPath: 'Shonen / Classics' }
      : s,
);

beforeEach(() => {
  useLibraryFilter.getState().reset();
  server.use(
    http.get(`${BASE}/api/library/groups`, () => HttpResponse.json({ groups: GROUPS })),
    http.get(`${BASE}/api/series`, () =>
      HttpResponse.json({ rows: ROWS, total: ROWS.length, page: 1, limit: 50 }),
    ),
  );
});

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <Library />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

it('tablet browse renders folder CARDS (not phone rows) and descends via crumbs', async () => {
  wrap();

  // Root: folder card + the top-bar New group button; the phone groups UI
  // (rows, ghost row, footer hint) must be absent.
  await waitFor(() => expect(screen.getByTestId('folder-card-1')).toBeTruthy(), {
    timeout: 15_000,
  });
  expect(screen.getByTestId('btn-new-group')).toBeTruthy();
  expect(screen.queryByTestId('group-row-1')).toBeNull();
  expect(screen.queryByTestId('new-group-row')).toBeNull();
  expect(screen.queryByText('LONG-PRESS A COVER · MOVE TO GROUP')).toBeNull();
  expect(screen.getByText('1 FOLDER · 2 SERIES')).toBeTruthy(); // card counts
  expect(screen.getByText('Spice and Wolf')).toBeTruthy(); // ungrouped
  expect(screen.queryByText('Vinland Saga')).toBeNull(); // inside Shonen

  // Descend into Shonen: breadcrumb bar replaces the phone back chip.
  await fireEvent.press(screen.getByTestId('folder-card-1'));
  await waitFor(() => expect(screen.getByTestId('group-crumbs')).toBeTruthy());
  expect(screen.queryByTestId('group-back-chip')).toBeNull();
  expect(screen.getByTestId('group-crumb-root')).toBeTruthy();
  expect(screen.getByTestId('group-crumb-1')).toBeTruthy(); // current (plain)
  expect(screen.getByTestId('folder-card-2')).toBeTruthy(); // Classics card
  expect(screen.getByText('Vinland Saga')).toBeTruthy();
  expect(screen.queryByText('Berserk')).toBeNull(); // lives in the subgroup

  // Descend again, then jump straight to the root via the Library crumb.
  await fireEvent.press(screen.getByTestId('folder-card-2'));
  await waitFor(() => expect(screen.getByText('Berserk')).toBeTruthy());
  expect(screen.getByTestId('group-crumb-1')).toBeTruthy(); // Shonen is a pill now
  expect(screen.getByTestId('group-crumb-2')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('group-crumb-root'));
  await waitFor(() => expect(screen.getByTestId('folder-card-1')).toBeTruthy());
  expect(screen.queryByTestId('group-crumbs')).toBeNull();
  expect(screen.getByText('Spice and Wolf')).toBeTruthy();
}, 30_000);

it('intermediate crumbs navigate to their group', async () => {
  wrap();
  await waitFor(() => expect(screen.getByTestId('folder-card-1')).toBeTruthy(), {
    timeout: 15_000,
  });
  await fireEvent.press(screen.getByTestId('folder-card-1'));
  await waitFor(() => expect(screen.getByTestId('folder-card-2')).toBeTruthy());
  await fireEvent.press(screen.getByTestId('folder-card-2'));
  await waitFor(() => expect(screen.getByText('Berserk')).toBeTruthy());

  // Shonen is now an intermediate crumb pill — tapping it pops one level.
  await fireEvent.press(screen.getByTestId('group-crumb-1'));
  await waitFor(() => expect(screen.getByText('Vinland Saga')).toBeTruthy());
  expect(screen.getByTestId('folder-card-2')).toBeTruthy();
}, 30_000);

it('the top-bar New group button opens the create sheet at the open path', async () => {
  wrap();
  await waitFor(() => expect(screen.getByTestId('btn-new-group')).toBeTruthy(), {
    timeout: 15_000,
  });
  await fireEvent.press(screen.getByTestId('btn-new-group'));
  await waitFor(() => expect(screen.getByTestId('create-group-sheet')).toBeTruthy());
  expect(screen.getByText('IN · LIBRARY')).toBeTruthy();
}, 30_000);

it('long-pressing a folder card opens the group actions sheet', async () => {
  wrap();
  await waitFor(() => expect(screen.getByTestId('folder-card-1')).toBeTruthy(), {
    timeout: 15_000,
  });
  await fireEvent(screen.getByTestId('folder-card-1'), 'longPress');
  await waitFor(() => expect(screen.getByTestId('group-actions-sheet')).toBeTruthy());
  expect(screen.getByTestId('group-action-rename')).toBeTruthy();
  expect(screen.getByTestId('group-action-delete')).toBeTruthy();
}, 30_000);
