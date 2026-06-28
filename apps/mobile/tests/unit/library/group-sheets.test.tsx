import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { ReactElement } from 'react';
import { CreateGroupSheet } from '@/features/library/groups/CreateGroupSheet';
import { GroupActionsSheet } from '@/features/library/groups/GroupActionsSheet';
import { RenameGroupSheet } from '@/features/library/groups/RenameGroupSheet';
import { DeleteGroupConfirmSheet } from '@/features/library/groups/DeleteGroupConfirmSheet';
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

// Shonen (root) ⊃ Classics; Seinen (root, empty). seriesCount is recursive.
const SHONEN = {
  id: 1,
  name: 'Shonen',
  parentId: null,
  path: 'Shonen',
  seriesCount: 2,
  subgroupCount: 1,
};
const CLASSICS = {
  id: 2,
  name: 'Classics',
  parentId: 1,
  path: 'Shonen / Classics',
  seriesCount: 1,
  subgroupCount: 0,
};
const SEINEN = {
  id: 3,
  name: 'Seinen',
  parentId: null,
  path: 'Seinen',
  seriesCount: 0,
  subgroupCount: 0,
};
const GROUPS = [SHONEN, CLASSICS, SEINEN];

async function wrap(ui: ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  await render(
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
  // Wait one microtask tick so AuthProvider settles to authenticated before
  // any mutation fires (the hooks throw 'unauthenticated' otherwise).
  await act(async () => {
    await Promise.resolve();
  });
}

describe('CreateGroupSheet', () => {
  it('shows the Library context line at the root and disables Create when empty', async () => {
    await wrap(<CreateGroupSheet visible parentId={null} groups={GROUPS} onClose={() => {}} />);

    expect(screen.getByTestId('create-group-sheet')).toBeTruthy();
    expect(screen.getByText('IN · LIBRARY')).toBeTruthy();
    expect(screen.getByTestId('create-group-confirm')).toBeDisabled();

    // Whitespace-only stays disabled; a real name enables.
    await fireEvent.changeText(screen.getByTestId('create-group-input'), '   ');
    expect(screen.getByTestId('create-group-confirm')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('create-group-input'), 'Romance');
    expect(screen.getByTestId('create-group-confirm')).not.toBeDisabled();
  }, 30_000);

  it('shows the nested path context line and POSTs name + parentId', async () => {
    let received: unknown = null;
    server.use(
      http.post(`${BASE}/api/library/groups`, async ({ request }) => {
        received = await request.json();
        return HttpResponse.json(
          { id: 9, name: 'Isekai', parentId: 2, path: 'Shonen / Classics / Isekai', seriesCount: 0, subgroupCount: 0 },
          { status: 201 },
        );
      }),
    );
    const onClose = jest.fn();
    await wrap(<CreateGroupSheet visible parentId={2} groups={GROUPS} onClose={onClose} />);

    expect(screen.getByText('IN · SHONEN / CLASSICS')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('create-group-input'), '  Isekai  ');
    await fireEvent.press(screen.getByTestId('create-group-confirm'));

    // Trimmed name; parentId present for a nested create.
    await waitFor(() => expect(received).toEqual({ name: 'Isekai', parentId: 2 }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  }, 30_000);

  it('omits parentId entirely at the root', async () => {
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
    const onClose = jest.fn();
    await wrap(<CreateGroupSheet visible parentId={null} groups={GROUPS} onClose={onClose} />);

    await fireEvent.changeText(screen.getByTestId('create-group-input'), 'Romance');
    await fireEvent.press(screen.getByTestId('create-group-confirm'));

    await waitFor(() => expect(received).toEqual({ name: 'Romance' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  }, 30_000);

  it('surfaces a 409 inline and stays open', async () => {
    server.use(
      http.post(`${BASE}/api/library/groups`, () =>
        HttpResponse.json(
          { error: 'A group with that name already exists here.' },
          { status: 409 },
        ),
      ),
    );
    const onClose = jest.fn();
    await wrap(<CreateGroupSheet visible parentId={null} groups={GROUPS} onClose={onClose} />);

    await fireEvent.changeText(screen.getByTestId('create-group-input'), 'Shonen');
    await fireEvent.press(screen.getByTestId('create-group-confirm'));

    await waitFor(() => expect(screen.getByTestId('create-group-error')).toBeTruthy());
    expect(screen.getByText('A group with that name already exists here.')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('create-group-input')).toBeTruthy();
  }, 30_000);
});

describe('GroupActionsSheet', () => {
  it('renders the header and fires the row callbacks', async () => {
    const onRename = jest.fn();
    const onNewSubgroup = jest.fn();
    const onDelete = jest.fn();
    await wrap(
      <GroupActionsSheet
        group={CLASSICS}
        visible
        onClose={() => {}}
        onRename={onRename}
        onNewSubgroup={onNewSubgroup}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByTestId('group-actions-sheet')).toBeTruthy();
    expect(screen.getByText('Classics')).toBeTruthy();
    expect(screen.getByText('SHONEN / CLASSICS')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('group-action-rename'));
    expect(onRename).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('group-action-subgroup'));
    expect(onNewSubgroup).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('group-action-delete'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  }, 30_000);
});

describe('RenameGroupSheet', () => {
  it('prefills the current name and PATCHes the trimmed new name', async () => {
    let received: unknown = null;
    server.use(
      http.patch(`${BASE}/api/library/groups/:id`, async ({ request, params }) => {
        received = { id: params.id, body: await request.json() };
        return HttpResponse.json({ ...SHONEN, name: 'Shounen' });
      }),
    );
    const onClose = jest.fn();
    await wrap(<RenameGroupSheet group={SHONEN} visible onClose={onClose} />);

    const input = screen.getByTestId('rename-group-input');
    expect(input.props.value).toBe('Shonen');
    // Unchanged → disabled; cleared → disabled; new name → enabled.
    expect(screen.getByTestId('rename-group-confirm')).toBeDisabled();
    await fireEvent.changeText(input, '');
    expect(screen.getByTestId('rename-group-confirm')).toBeDisabled();
    await fireEvent.changeText(input, ' Shounen ');
    expect(screen.getByTestId('rename-group-confirm')).not.toBeDisabled();

    await fireEvent.press(screen.getByTestId('rename-group-confirm'));
    await waitFor(() => expect(received).toEqual({ id: '1', body: { name: 'Shounen' } }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  }, 30_000);

  it('surfaces a 409 inline and stays open', async () => {
    server.use(
      http.patch(`${BASE}/api/library/groups/:id`, () =>
        HttpResponse.json(
          { error: 'A group with that name already exists here.' },
          { status: 409 },
        ),
      ),
    );
    const onClose = jest.fn();
    await wrap(<RenameGroupSheet group={SEINEN} visible onClose={onClose} />);

    await fireEvent.changeText(screen.getByTestId('rename-group-input'), 'Shonen');
    await fireEvent.press(screen.getByTestId('rename-group-confirm'));

    await waitFor(() => expect(screen.getByTestId('rename-group-error')).toBeTruthy());
    expect(screen.getByText('A group with that name already exists here.')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  }, 30_000);
});

describe('DeleteGroupConfirmSheet', () => {
  it('arms via the typed-name gate — exact match, case-sensitive', async () => {
    await wrap(
      <DeleteGroupConfirmSheet
        group={SHONEN}
        groups={GROUPS}
        visible
        onClose={() => {}}
        onDeleted={() => {}}
      />,
    );

    // Shonen: self + Classics = 2 groups, recursive seriesCount = 2.
    expect(
      screen.getByText('Deletes 2 groups and 2 series from your library. Files on disk are untouched.'),
    ).toBeTruthy();
    expect(screen.getByTestId('delete-group-input')).toBeTruthy();
    expect(screen.getByText("Type the group's name to confirm")).toBeTruthy();
    expect(screen.getByTestId('delete-group-confirm')).toBeDisabled();

    // Wrong case stays disabled; the exact name arms the button.
    await fireEvent.changeText(screen.getByTestId('delete-group-input'), 'shonen');
    expect(screen.getByTestId('delete-group-confirm')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('delete-group-input'), 'Shonen');
    expect(screen.getByTestId('delete-group-confirm')).not.toBeDisabled();
  }, 30_000);

  it('skips the typed gate for an empty leaf group (singular copy)', async () => {
    await wrap(
      <DeleteGroupConfirmSheet
        group={SEINEN}
        groups={GROUPS}
        visible
        onClose={() => {}}
        onDeleted={() => {}}
      />,
    );

    expect(
      screen.getByText('Deletes 1 group and 0 series from your library. Files on disk are untouched.'),
    ).toBeTruthy();
    expect(screen.queryByTestId('delete-group-input')).toBeNull();
    expect(screen.getByTestId('delete-group-confirm')).not.toBeDisabled();
  }, 30_000);

  it('DELETEs the group and reports the parentId via onDeleted', async () => {
    let deletedId: string | null = null;
    server.use(
      http.delete(`${BASE}/api/library/groups/:id`, ({ params }) => {
        deletedId = String(params.id);
        return HttpResponse.json({ deletedGroups: 1, deletedSeries: 1 });
      }),
    );
    const onClose = jest.fn();
    const onDeleted = jest.fn();
    // Classics: leaf but holds 1 series → typed gate applies.
    await wrap(
      <DeleteGroupConfirmSheet
        group={CLASSICS}
        groups={GROUPS}
        visible
        onClose={onClose}
        onDeleted={onDeleted}
      />,
    );

    expect(
      screen.getByText('Deletes 1 group and 1 series from your library. Files on disk are untouched.'),
    ).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('delete-group-input'), 'Classics');
    await fireEvent.press(screen.getByTestId('delete-group-confirm'));

    await waitFor(() => expect(deletedId).toBe('2'));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(1));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  }, 30_000);
});
