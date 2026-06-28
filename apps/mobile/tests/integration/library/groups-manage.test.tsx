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

interface MockGroup {
  id: number;
  name: string;
  parentId: number | null;
  path: string;
  seriesCount: number;
  subgroupCount: number;
}

// Stateful groups so create → list and delete → list reflect across refetches.
let groups: MockGroup[] = [];
let nextId = 100;

beforeEach(() => {
  useLibraryFilter.getState().reset();
  groups = [
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
  server.use(
    http.get(`${BASE}/api/library/groups`, () => HttpResponse.json({ groups })),
    http.post(`${BASE}/api/library/groups`, async ({ request }) => {
      const body = (await request.json()) as { name: string; parentId?: number };
      const parent = body.parentId != null ? groups.find((g) => g.id === body.parentId) : undefined;
      const created: MockGroup = {
        id: nextId++,
        name: body.name,
        parentId: parent?.id ?? null,
        path: parent ? `${parent.path} / ${body.name}` : body.name,
        seriesCount: 0,
        subgroupCount: 0,
      };
      groups = [...groups, created];
      return HttpResponse.json(created, { status: 201 });
    }),
    http.delete(`${BASE}/api/library/groups/:id`, ({ params }) => {
      const id = Number(params.id);
      const doomed = new Set<number>([id]);
      // Naive descendant sweep — fine for the two-level fixture.
      for (const g of groups) if (g.parentId !== null && doomed.has(g.parentId)) doomed.add(g.id);
      const deletedGroups = groups.filter((g) => doomed.has(g.id)).length;
      groups = groups.filter((g) => !doomed.has(g.id));
      return HttpResponse.json({ deletedGroups, deletedSeries: 2 });
    }),
    http.get(`${BASE}/api/series`, () =>
      HttpResponse.json({ rows: fixtureSeries, total: fixtureSeries.length, page: 1, limit: 50 }),
    ),
  );
});

function wrap() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
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

it('creates a group from the ghost row — scoped to the open group', async () => {
  wrap();
  await waitFor(() => expect(screen.getByTestId('group-row-1')).toBeTruthy(), {
    timeout: 15_000,
  });

  // Root: ghost row opens the create sheet with the Library context line.
  await fireEvent.press(screen.getByTestId('new-group-row'));
  await waitFor(() => expect(screen.getByTestId('create-group-sheet')).toBeTruthy());
  expect(screen.getByText('IN · LIBRARY')).toBeTruthy();

  await fireEvent.changeText(screen.getByTestId('create-group-input'), 'Romance');
  await fireEvent.press(screen.getByTestId('create-group-confirm'));

  // Sheet closes; the invalidated list refetches and the new row appears.
  await waitFor(() => expect(screen.queryByTestId('create-group-sheet')).toBeNull());
  await waitFor(() => expect(screen.getByText('Romance')).toBeTruthy());

  // Inside a group the sheet is scoped to it (parentId = open path).
  await fireEvent.press(screen.getByTestId('group-row-1'));
  await waitFor(() => expect(screen.getByTestId('group-back-chip')).toBeTruthy());
  await fireEvent.press(screen.getByTestId('new-group-row'));
  await waitFor(() => expect(screen.getByText('IN · SHONEN')).toBeTruthy());
}, 30_000);

it('long-press → actions sheet → typed-name delete removes the row', async () => {
  wrap();
  await waitFor(() => expect(screen.getByTestId('group-row-1')).toBeTruthy(), {
    timeout: 15_000,
  });

  await fireEvent(screen.getByTestId('group-row-1'), 'longPress');
  await waitFor(() => expect(screen.getByTestId('group-actions-sheet')).toBeTruthy());

  await fireEvent.press(screen.getByTestId('group-action-delete'));
  await waitFor(() => expect(screen.getByTestId('delete-group-sheet')).toBeTruthy());
  // Shonen subtree: 2 groups, 2 recursive series → armed delete.
  expect(
    screen.getByText('Deletes 2 groups and 2 series from your library. Files on disk are untouched.'),
  ).toBeTruthy();
  expect(screen.getByTestId('delete-group-confirm')).toBeDisabled();

  await fireEvent.changeText(screen.getByTestId('delete-group-input'), 'Shonen');
  await fireEvent.press(screen.getByTestId('delete-group-confirm'));

  // Sheet closes and the row disappears via invalidation.
  await waitFor(() => expect(screen.queryByTestId('delete-group-sheet')).toBeNull());
  await waitFor(() => expect(screen.queryByTestId('group-row-1')).toBeNull());
}, 30_000);

it('actions sheet rename flows through to the renamed row', async () => {
  server.use(
    http.patch(`${BASE}/api/library/groups/:id`, async ({ params, request }) => {
      const body = (await request.json()) as { name: string };
      groups = groups.map((g) =>
        g.id === Number(params.id) ? { ...g, name: body.name, path: body.name } : g,
      );
      return HttpResponse.json(groups.find((g) => g.id === Number(params.id)));
    }),
  );
  wrap();
  await waitFor(() => expect(screen.getByTestId('group-row-1')).toBeTruthy(), {
    timeout: 15_000,
  });

  await fireEvent(screen.getByTestId('group-row-1'), 'longPress');
  await waitFor(() => expect(screen.getByTestId('group-actions-sheet')).toBeTruthy());
  await fireEvent.press(screen.getByTestId('group-action-rename'));

  await waitFor(() => expect(screen.getByTestId('rename-group-input')).toBeTruthy());
  expect(screen.getByTestId('rename-group-input').props.value).toBe('Shonen');
  await fireEvent.changeText(screen.getByTestId('rename-group-input'), 'Shounen');
  await fireEvent.press(screen.getByTestId('rename-group-confirm'));

  await waitFor(() => expect(screen.queryByTestId('rename-group-input')).toBeNull());
  await waitFor(() => expect(screen.getByText('Shounen')).toBeTruthy());
}, 30_000);
