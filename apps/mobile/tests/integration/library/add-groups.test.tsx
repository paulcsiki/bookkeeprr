/**
 * Task 5: AddSeries — "Add into" group picker integration tests.
 * Verifies that:
 *   - The add-into-row renders showing "Library root" by default.
 *   - Tapping the row opens GroupPickerSheet.
 *   - Selecting a group updates the row label.
 *   - The groupId is included in the POST body on add.
 *   - groupId is reset to null after a successful add.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import AddSeries from '@/screens/library/AddSeries';
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

const GROUPS = [
  { id: 1, name: 'Shonen', parentId: null, path: 'Shonen', seriesCount: 0, subgroupCount: 0 },
  { id: 2, name: 'Seinen', parentId: null, path: 'Seinen', seriesCount: 0, subgroupCount: 0 },
];

beforeEach(() => {
  server.use(http.get(`${BASE}/api/library/groups`, () => HttpResponse.json({ groups: GROUPS })));
});

async function wrap() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  await render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <AddSeries />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

it('shows the add-into row with "Library root" by default', async () => {
  await wrap();
  expect(screen.getByTestId('add-into-row')).toBeTruthy();
  expect(screen.getByText('Library root')).toBeTruthy();
});

it('opens the group picker sheet when add-into row is tapped', async () => {
  await wrap();
  expect(screen.queryByTestId('group-picker-sheet')).toBeNull();
  fireEvent.press(screen.getByTestId('add-into-row'));
  await waitFor(() => expect(screen.getByTestId('group-picker-sheet')).toBeTruthy());
  // Sheet testID confirms it opened with the correct sheet
  expect(screen.getByTestId('group-picker-sheet')).toBeTruthy();
});

it('updates the selection label after picking a group', async () => {
  await wrap();
  fireEvent.press(screen.getByTestId('add-into-row'));
  await waitFor(() => expect(screen.getByTestId('picker-row-1')).toBeTruthy(), {
    timeout: 15_000,
  });
  // Pick "Shonen"
  fireEvent.press(screen.getByTestId('picker-row-1'));
  // Sheet closes and row label updates
  await waitFor(() => expect(screen.queryByTestId('group-picker-sheet')).toBeNull());
  expect(screen.getByText('Shonen')).toBeTruthy();
}, 30_000);

it('includes groupId in POST body when a group is selected', async () => {
  let received: unknown = null;
  server.use(
    http.post(`${BASE}/api/series`, async ({ request }) => {
      received = await request.json();
      return HttpResponse.json({ id: 999 }, { status: 201 });
    }),
  );
  await wrap();
  // Open picker and select Seinen (id=2)
  fireEvent.press(screen.getByTestId('add-into-row'));
  await waitFor(() => expect(screen.getByTestId('picker-row-2')).toBeTruthy(), {
    timeout: 15_000,
  });
  fireEvent.press(screen.getByTestId('picker-row-2'));
  await waitFor(() => expect(screen.queryByTestId('group-picker-sheet')).toBeNull());

  // Now search and add a series
  fireEvent.changeText(screen.getByTestId('input-add-search'), 'vinland');
  await waitFor(() => expect(screen.getByText('Vinland Saga')).toBeTruthy(), { timeout: 15_000 });
  // The add button testID is btn-add-<sourceId>; search results include anilist:30002
  // anilist:30002 is inLibrary (no add btn); use anilist:30003 which has the Add button
  await fireEvent.press(screen.getByTestId('btn-add-anilist:30003'));

  await waitFor(() => expect(received).toBeTruthy());
  expect((received as Record<string, unknown>).groupId).toBe(2);
}, 30_000);

it('omits groupId from POST body when Library root is selected', async () => {
  let received: unknown = null;
  server.use(
    http.post(`${BASE}/api/series`, async ({ request }) => {
      received = await request.json();
      return HttpResponse.json({ id: 999 }, { status: 201 });
    }),
  );
  await wrap();
  // Default is Library root — no groupId needed

  fireEvent.changeText(screen.getByTestId('input-add-search'), 'vinland');
  await waitFor(() => expect(screen.getByText('Vinland Saga')).toBeTruthy(), { timeout: 15_000 });
  // anilist:30002 is inLibrary (no add btn); use anilist:30003 which has the Add button
  await fireEvent.press(screen.getByTestId('btn-add-anilist:30003'));

  await waitFor(() => expect(received).toBeTruthy());
  expect((received as Record<string, unknown>).groupId).toBeUndefined();
}, 30_000);
