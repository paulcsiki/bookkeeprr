/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiFetch = vi.fn();
const refresh = vi.fn();

vi.mock('@/lib/api-fetch', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { RenameDialog } from '@/components/library/RenameDialog';

const PLAN = {
  seriesId: 7,
  folder: { current: '/media/comics/Old', proposed: '/media/comics/New', changed: true },
  files: [
    {
      libraryFileId: 1,
      currentPath: '/media/comics/Old/wrongname.cbz',
      proposedPath: '/media/comics/New/My Series - v02 [].cbz',
    },
  ],
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderDialog() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <RenameDialog seriesId={7} open onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('RenameDialog', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    refresh.mockReset();
  });

  it('loads the plan and renames on confirm (POST)', async () => {
    apiFetch.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return json({ renamed: 1, errors: [] });
      return json(PLAN);
    });

    renderDialog();

    // Basenames from the plan render once the GET resolves.
    await waitFor(() => {
      expect(screen.queryByText('My Series - v02 [].cbz')).toBeTruthy();
    });
    expect(screen.getByText('New')).toBeTruthy(); // folder proposed basename

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    await waitFor(() => {
      const posted = apiFetch.mock.calls.some(
        ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
      );
      expect(posted).toBe(true);
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('shows the no-op message when nothing needs renaming', async () => {
    apiFetch.mockImplementation(async () =>
      json({ seriesId: 7, folder: { current: '/a', proposed: '/a', changed: false }, files: [] }),
    );

    renderDialog();

    await waitFor(() => {
      expect(screen.queryByText('Already organized — nothing to rename.')).toBeTruthy();
    });
    // No Rename button on a clean plan.
    expect(screen.queryByRole('button', { name: 'Rename' })).toBeNull();
  });
});
