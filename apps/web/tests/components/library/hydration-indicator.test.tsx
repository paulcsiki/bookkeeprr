/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiFetch = vi.fn();
const refresh = vi.fn();

vi.mock('@/lib/api-fetch', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { HydrationIndicator, activityLabel } from '@/app/(app)/library/[id]/HydrationIndicator';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderIndicator(seriesId = 42) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const result = render(
    <QueryClientProvider client={qc}>
      <HydrationIndicator seriesId={seriesId} />
    </QueryClientProvider>,
  );
  return { ...result, qc };
}

describe('HydrationIndicator', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    refresh.mockReset();
  });

  it('shows the pill while the endpoint reports hydrating', async () => {
    apiFetch.mockImplementation(async () => json({ hydrating: true }));
    renderIndicator();
    await waitFor(() => {
      expect(screen.queryByText('Fetching details…')).toBeTruthy();
    });
  });

  it('renders nothing when hydration is not active on first poll', async () => {
    apiFetch.mockImplementation(async () => json({ hydrating: false }));
    const { container } = renderIndicator();
    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalled();
    });
    expect(screen.queryByText('Fetching details…')).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('shows the kind-derived label while running', async () => {
    apiFetch.mockImplementation(async () =>
      json({ running: true, kinds: ['mangadex_chapter_sync'] }),
    );
    renderIndicator();
    await waitFor(() => {
      expect(screen.queryByText('Syncing chapters…')).toBeTruthy();
    });
  });

  it('renders nothing when running:false', async () => {
    apiFetch.mockImplementation(async () => json({ running: false, kinds: [] }));
    const { container } = renderIndicator();
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('clears the pill and refreshes once when activity flips to done', async () => {
    let running = true;
    apiFetch.mockImplementation(async () => json({ running, kinds: running ? ['import'] : [] }));
    renderIndicator();

    // Pill visible while running.
    await waitFor(() => expect(screen.queryByText('Importing…')).toBeTruthy());

    // The job settles; the next poll returns idle.
    running = false;
    await waitFor(
      () => {
        expect(screen.queryByText('Importing…')).toBeNull();
      },
      { timeout: 5_000 },
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('invalidates the releases + toc query caches when activity settles', async () => {
    let running = true;
    apiFetch.mockImplementation(async () => json({ running, kinds: running ? ['import'] : [] }));
    const { qc } = renderIndicator(42);
    const invalidate = vi.spyOn(qc, 'invalidateQueries');

    // Pill visible while running.
    await waitFor(() => expect(screen.queryByText('Importing…')).toBeTruthy());

    // The job settles; the next poll returns idle and triggers the final refresh.
    running = false;
    await waitFor(
      () => {
        expect(screen.queryByText('Importing…')).toBeNull();
      },
      { timeout: 5_000 },
    );

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    // Both query-backed tabs are invalidated for this series.
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['series-releases', 42] }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['series-toc', 42] });
  });
});

describe('activityLabel', () => {
  it('maps metadata-hydrate kinds to "Fetching metadata…"', () => {
    expect(activityLabel(['metadata_hydrate'])).toBe('Fetching metadata…');
    expect(activityLabel(['comicvine_hydrate'])).toBe('Fetching metadata…');
    expect(activityLabel(['novel_updates_hydrate'])).toBe('Fetching metadata…');
  });

  it('maps chapter-sync kinds to "Syncing chapters…"', () => {
    expect(activityLabel(['novel_updates_chapter_sync'])).toBe('Syncing chapters…');
    expect(activityLabel(['mangadex_chapter_sync'])).toBe('Syncing chapters…');
  });

  it('maps volume hydrate to "Fetching volumes…"', () => {
    expect(activityLabel(['mangadex_volume_hydrate'])).toBe('Fetching volumes…');
  });

  it('maps import to "Importing…"', () => {
    expect(activityLabel(['import'])).toBe('Importing…');
  });

  it('collapses a mix of groups to "Working…"', () => {
    expect(activityLabel(['metadata_hydrate', 'mangadex_chapter_sync'])).toBe('Working…');
  });

  it('falls back to "Fetching details…" for an empty set', () => {
    expect(activityLabel([])).toBe('Fetching details…');
  });
});
