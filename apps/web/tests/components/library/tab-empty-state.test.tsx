/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiFetch = vi.fn();
vi.mock('@/lib/api-fetch', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

import {
  VolumesEmptyState,
  ReleasesEmptyState,
} from '@/app/(app)/library/[id]/tabs/TabEmptyState';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderWithClient(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe('VolumesEmptyState', () => {
  beforeEach(() => apiFetch.mockReset());

  it('shows the idle hint when no relevant job is running', async () => {
    apiFetch.mockImplementation(async () => json({ running: false, kinds: [] }));
    renderWithClient(<VolumesEmptyState seriesId={1} />);
    await waitFor(() => {
      expect(screen.queryByText('No volumes yet')).toBeTruthy();
    });
    expect(
      screen.queryByText('Volumes are created when you grab and import a release.'),
    ).toBeTruthy();
  });

  it('shows the fetching spinner when a volume job is running', async () => {
    apiFetch.mockImplementation(async () =>
      json({ running: true, kinds: ['mangadex_volume_hydrate'] }),
    );
    renderWithClient(<VolumesEmptyState seriesId={1} />);
    await waitFor(() => {
      expect(screen.queryByText('Fetching volumes…')).toBeTruthy();
    });
  });
});

describe('ReleasesEmptyState', () => {
  beforeEach(() => apiFetch.mockReset());

  it('shows the actionable idle hint when no sync is running', async () => {
    apiFetch.mockImplementation(async () => json({ running: false, kinds: [] }));
    renderWithClient(<ReleasesEmptyState seriesId={1} />);
    await waitFor(() => {
      expect(screen.queryByText('No releases yet')).toBeTruthy();
    });
    expect(screen.queryByText('Run an Interactive search to find some.')).toBeTruthy();
  });

  it('shows the syncing spinner when a chapter-sync job is running', async () => {
    apiFetch.mockImplementation(async () =>
      json({ running: true, kinds: ['novel_updates_chapter_sync'] }),
    );
    renderWithClient(<ReleasesEmptyState seriesId={1} />);
    await waitFor(() => {
      expect(screen.queryByText('Syncing chapters…')).toBeTruthy();
    });
  });
});
