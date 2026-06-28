/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiFetch = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('@/lib/api-fetch', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));

import { RenameAllButton } from '@/components/library/RenameAllButton';

const PREVIEW = {
  series: [
    {
      seriesId: 7,
      title: 'My Series',
      folder: { current: '/media/comics/Old', proposed: '/media/comics/New', changed: true },
      files: [
        {
          libraryFileId: 1,
          currentPath: '/media/comics/Old/wrongname.cbz',
          proposedPath: '/media/comics/New/My Series - v02 [].cbz',
        },
      ],
    },
  ],
  seriesChanged: 1,
  totalChanges: 2,
};

const EMPTY_PREVIEW = { series: [], seriesChanged: 0, totalChanges: 0 };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderButton() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <RenameAllButton />
    </QueryClientProvider>,
  );
}

describe('RenameAllButton', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  it('builds a preview, then POSTs and toasts success on confirm', async () => {
    apiFetch.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return json({ jobId: 42 }, 202);
      return json(PREVIEW); // GET dry-run
    });

    renderButton();

    // Open the dialog → it builds a preview.
    fireEvent.click(screen.getByRole('button', { name: 'Rename all' }));

    // The planned changes from the preview render once the GET resolves.
    await waitFor(() => {
      expect(screen.queryByText('My Series - v02 [].cbz')).toBeTruthy();
    });
    expect(screen.getByText('My Series')).toBeTruthy(); // series group header

    // The GET preview happened, no POST yet.
    expect(
      apiFetch.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'POST'),
    ).toBe(false);

    // Confirm "Rename all" (the apply button inside the dialog).
    const actions = screen.getAllByRole('button', { name: 'Rename all' });
    fireEvent.click(actions[actions.length - 1]!);

    await waitFor(() => {
      const posted = apiFetch.mock.calls.some(
        ([url, init]) =>
          url === '/api/library/rename-all' &&
          (init as RequestInit | undefined)?.method === 'POST',
      );
      expect(posted).toBe(true);
    });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
  });

  it('shows an empty state and disables apply when nothing to organize', async () => {
    apiFetch.mockResolvedValue(json(EMPTY_PREVIEW));

    renderButton();
    fireEvent.click(screen.getByRole('button', { name: 'Rename all' }));

    await waitFor(() => {
      expect(screen.queryByText('Everything is already organized.')).toBeTruthy();
    });

    // The apply button is present but disabled (no changes to make).
    const actions = screen.getAllByRole('button', { name: 'Rename all' });
    const apply = actions[actions.length - 1]!;
    expect(apply).toHaveProperty('disabled', true);
  });

  it('toasts an error when the preview request fails', async () => {
    apiFetch.mockResolvedValue(json({ message: 'Forbidden' }, 403));

    renderButton();
    fireEvent.click(screen.getByRole('button', { name: 'Rename all' }));

    await waitFor(() => expect(screen.queryByText('Forbidden')).toBeTruthy());
  });
});
