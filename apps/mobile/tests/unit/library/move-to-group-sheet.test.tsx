import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { MoveToGroupSheet } from '@/features/library/groups/MoveToGroupSheet';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/auth/AuthContext';
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

// Shonen (root) ⊃ Classics; Seinen (root). Preorder picker: Seinen, Shonen, Classics.
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
  { id: 3, name: 'Seinen', parentId: null, path: 'Seinen', seriesCount: 0, subgroupCount: 0 },
];

const UNGROUPED = { id: 11, title: 'Vinland Saga', coverUrl: null, groupId: null };
const GROUPED = { id: 12, title: 'Berserk', coverUrl: null, groupId: 2 };

beforeEach(() => {
  server.use(http.get(`${BASE}/api/library/groups`, () => HttpResponse.json({ groups: GROUPS })));
});

function wrap(
  series: { id: number; title: string; coverUrl: string | null; groupId: number | null },
  onClose: () => void = () => {},
) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <MoveToGroupSheet series={series} visible onClose={onClose} />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

it('renders the header sub, root row, and the depth-indented group tree', async () => {
  wrap(GROUPED);
  await waitFor(() => expect(screen.getByTestId('move-row-1')).toBeTruthy(), {
    timeout: 15_000,
  });
  expect(screen.getByTestId('move-sheet')).toBeTruthy();
  expect(screen.getByText('Move to group')).toBeTruthy();
  expect(screen.getByText('BERSERK · CURRENTLY IN CLASSICS')).toBeTruthy();
  expect(screen.getByTestId('move-row-root')).toBeTruthy();
  expect(screen.getByText('Library · no group')).toBeTruthy();
  // Preorder DFS, alphabetical at each level: Seinen, Shonen, Shonen/Classics.
  expect(screen.getByTestId('move-row-3')).toBeTruthy();
  expect(screen.getByTestId('move-row-2')).toBeTruthy();
  expect(screen.getByTestId('move-new-group')).toBeTruthy();
}, 30_000);

it('shows NO GROUP for an ungrouped series and disables confirm while unchanged', async () => {
  wrap(UNGROUPED);
  await waitFor(() => expect(screen.getByTestId('move-row-1')).toBeTruthy(), {
    timeout: 15_000,
  });
  expect(screen.getByText('VINLAND SAGA · CURRENTLY IN NO GROUP')).toBeTruthy();
  // Current location (root) preselected → unchanged → disabled.
  expect(screen.getByTestId('move-confirm')).toBeDisabled();
  expect(screen.getByText('Move to Library')).toBeTruthy();

  // Selecting a group enables the button and updates its label.
  await fireEvent.press(screen.getByTestId('move-row-1'));
  expect(screen.getByTestId('move-confirm')).not.toBeDisabled();
  expect(screen.getByText('Move to Shonen')).toBeTruthy();

  // Back to the unchanged selection → disabled again.
  await fireEvent.press(screen.getByTestId('move-row-root'));
  expect(screen.getByTestId('move-confirm')).toBeDisabled();
}, 30_000);

it('enables the root selection for a grouped series and PATCHes groupId null', async () => {
  let received: unknown = null;
  server.use(
    http.patch(`${BASE}/api/series/:id`, async ({ request, params }) => {
      received = { id: params.id, body: await request.json() };
      return HttpResponse.json({ ok: true });
    }),
  );
  const onClose = jest.fn();
  wrap(GROUPED, onClose);
  await waitFor(() => expect(screen.getByTestId('move-row-1')).toBeTruthy(), {
    timeout: 15_000,
  });
  expect(screen.getByTestId('move-confirm')).toBeDisabled();

  await fireEvent.press(screen.getByTestId('move-row-root'));
  expect(screen.getByTestId('move-confirm')).not.toBeDisabled();
  await fireEvent.press(screen.getByTestId('move-confirm'));

  await waitFor(() => expect(received).toEqual({ id: '12', body: { groupId: null } }));
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
}, 30_000);

it('confirms a move into a selected group with {seriesId, groupId}', async () => {
  let received: unknown = null;
  server.use(
    http.patch(`${BASE}/api/series/:id`, async ({ request, params }) => {
      received = { id: params.id, body: await request.json() };
      return HttpResponse.json({ ok: true });
    }),
  );
  const onClose = jest.fn();
  wrap(UNGROUPED, onClose);
  await waitFor(() => expect(screen.getByTestId('move-row-2')).toBeTruthy(), {
    timeout: 15_000,
  });
  await fireEvent.press(screen.getByTestId('move-row-2'));
  await fireEvent.press(screen.getByTestId('move-confirm'));

  await waitFor(() => expect(received).toEqual({ id: '11', body: { groupId: 2 } }));
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
}, 30_000);

it('inline create posts parentId = current selection and selects the new group', async () => {
  let received: unknown = null;
  server.use(
    http.post(`${BASE}/api/library/groups`, async ({ request }) => {
      received = await request.json();
      return HttpResponse.json(
        { id: 9, name: 'Isekai', parentId: 1, path: 'Shonen / Isekai', seriesCount: 0, subgroupCount: 0 },
        { status: 201 },
      );
    }),
  );
  wrap(UNGROUPED);
  await waitFor(() => expect(screen.getByTestId('move-row-1')).toBeTruthy(), {
    timeout: 15_000,
  });

  // Scope the create to the selected row (Shonen).
  await fireEvent.press(screen.getByTestId('move-row-1'));
  await fireEvent.press(screen.getByTestId('move-new-group'));
  await fireEvent.changeText(screen.getByTestId('move-new-group-input'), 'Isekai');
  await fireEvent.press(screen.getByTestId('move-new-group-create'));

  await waitFor(() => expect(received).toEqual({ name: 'Isekai', parentId: 1 }));
  // The created group becomes the selection: button is enabled + relabeled.
  await waitFor(() => expect(screen.getByText('Move to Isekai')).toBeTruthy());
  expect(screen.getByTestId('move-confirm')).not.toBeDisabled();
}, 30_000);

it('inline create at the root omits parentId entirely', async () => {
  let received: unknown = null;
  server.use(
    http.post(`${BASE}/api/library/groups`, async ({ request }) => {
      received = await request.json();
      return HttpResponse.json(
        { id: 10, name: 'Romance', parentId: null, path: 'Romance', seriesCount: 0, subgroupCount: 0 },
        { status: 201 },
      );
    }),
  );
  wrap(UNGROUPED); // selection starts at root (groupId null)
  await waitFor(() => expect(screen.getByTestId('move-new-group')).toBeTruthy(), {
    timeout: 15_000,
  });

  await fireEvent.press(screen.getByTestId('move-new-group'));
  await fireEvent.changeText(screen.getByTestId('move-new-group-input'), 'Romance');
  await fireEvent.press(screen.getByTestId('move-new-group-create'));

  await waitFor(() => expect(received).toEqual({ name: 'Romance' }));
  await waitFor(() => expect(screen.getByText('Move to Romance')).toBeTruthy());
}, 30_000);

it('surfaces a 409 on inline create as an inline error and keeps the input open', async () => {
  server.use(
    http.post(`${BASE}/api/library/groups`, () =>
      HttpResponse.json({ error: 'A group with that name already exists here.' }, { status: 409 }),
    ),
  );
  wrap(UNGROUPED);
  await waitFor(() => expect(screen.getByTestId('move-new-group')).toBeTruthy(), {
    timeout: 15_000,
  });

  await fireEvent.press(screen.getByTestId('move-new-group'));
  await fireEvent.changeText(screen.getByTestId('move-new-group-input'), 'Shonen');
  await fireEvent.press(screen.getByTestId('move-new-group-create'));

  await waitFor(() => expect(screen.getByTestId('move-create-error')).toBeTruthy());
  expect(screen.getByText('A group with that name already exists here.')).toBeTruthy();
  expect(screen.getByTestId('move-new-group-input')).toBeTruthy();
}, 30_000);
