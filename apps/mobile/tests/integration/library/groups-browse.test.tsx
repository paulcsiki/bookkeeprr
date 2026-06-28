import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import Library from '@/screens/library/LibraryHome';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/auth/AuthContext';
import { useLibraryFilter } from '@/state/libraryFilterStore';
import { server } from '../../mocks/server';
import { fixtureSeries } from '../../mocks/fixtures';

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
// everything else stays ungrouped. seriesCount is recursive (server fact).
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

it('browse mode renders the groups section, descends on tap, and pops via the back chip', async () => {
  wrap();

  // Root: group row + new-group ghost row + ungrouped series only.
  await waitFor(() => expect(screen.getByTestId('group-row-1')).toBeTruthy(), {
    timeout: 15_000,
  });
  expect(screen.getByText('Shonen')).toBeTruthy();
  expect(screen.getByText('1 FOLDER · 2 SERIES')).toBeTruthy();
  expect(screen.getByTestId('new-group-row')).toBeTruthy();
  expect(screen.getByText('Spice and Wolf')).toBeTruthy(); // ungrouped
  expect(screen.queryByText('Vinland Saga')).toBeNull(); // inside Shonen
  expect(screen.queryByTestId('group-back-chip')).toBeNull();
  expect(screen.getByText('LONG-PRESS A COVER · MOVE TO GROUP')).toBeTruthy();

  // Descend into Shonen: subgroup row + direct members; back chip replaces chips.
  await fireEvent.press(screen.getByTestId('group-row-1'));
  await waitFor(() => expect(screen.getByTestId('group-back-chip')).toBeTruthy());
  expect(screen.getByTestId('group-row-2')).toBeTruthy(); // Classics
  expect(screen.getByText('Vinland Saga')).toBeTruthy();
  expect(screen.queryByText('Berserk')).toBeNull(); // lives in the subgroup
  expect(screen.queryByText('Spice and Wolf')).toBeNull();
  expect(screen.queryByTestId('chip-all')).toBeNull();
  expect(screen.getByText('SHONEN · 2 SERIES')).toBeTruthy();

  // Descend into Classics; the back chip names the parent group.
  await fireEvent.press(screen.getByTestId('group-row-2'));
  await waitFor(() => expect(screen.getByText('Berserk')).toBeTruthy());
  expect(screen.getByText('SHONEN / CLASSICS · 1 SERIES')).toBeTruthy();
  // Classics is a leaf group: ghost row present, but no bordered groups section.
  expect(screen.getByTestId('new-group-row')).toBeTruthy();
  expect(screen.queryByTestId('group-row-2')).toBeNull(); // no child group rows

  // Pop back to Shonen, then to the root (ChipRow returns).
  await fireEvent.press(screen.getByTestId('group-back-chip'));
  await waitFor(() => expect(screen.getByText('Vinland Saga')).toBeTruthy());
  await fireEvent.press(screen.getByTestId('group-back-chip'));
  await waitFor(() => expect(screen.getByTestId('chip-all')).toBeTruthy());
  expect(screen.getByText('Spice and Wolf')).toBeTruthy();
}, 30_000);

it('active filters switch to flat mode and hide the groups UI', async () => {
  useLibraryFilter.getState().setMon('monitored');
  wrap();

  // Flat mode: every monitored series renders regardless of group…
  await waitFor(() => expect(screen.getByText('Vinland Saga')).toBeTruthy(), {
    timeout: 15_000,
  });
  expect(screen.getByText('Berserk')).toBeTruthy();
  // …and the groups UI is fully hidden.
  expect(screen.queryByTestId('group-row-1')).toBeNull();
  expect(screen.queryByTestId('new-group-row')).toBeNull();
  expect(screen.queryByText('LONG-PRESS A COVER · MOVE TO GROUP')).toBeNull();
}, 30_000);
