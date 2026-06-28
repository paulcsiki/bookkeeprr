/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const apiFetch = vi.fn();

vi.mock('@/lib/api-fetch', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
// The history dialog pulls in extra deps we don't need here.
vi.mock('@/components/VersionHistoryDialog', () => ({
  VersionHistoryDialog: () => null,
}));

import { VersionPill } from '@/components/VersionPill';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('VersionPill', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('shows the current version with "(Up To Date)" when no update is available', async () => {
    apiFetch.mockImplementation(async () =>
      json({
        buildInfo: { version: '1.0.0', commit: 'abc' },
        state: { latestVersion: '1.0.0' },
        updateAvailable: false,
      }),
    );
    render(<VersionPill />);
    await waitFor(() => expect(screen.getByText('1.0.0 (abc) · Up To Date')).toBeTruthy());
  });

  it('shows the CURRENT version with "(Update Available)" — never the latest', async () => {
    apiFetch.mockImplementation(async () =>
      json({
        buildInfo: { version: '1.0.0', commit: 'abc' },
        state: { latestVersion: '1.2.0' },
        updateAvailable: true,
      }),
    );
    render(<VersionPill />);
    await waitFor(() => expect(screen.getByText('1.0.0 (abc) · Update Available')).toBeTruthy());
    // The latest version (1.2.0) must NOT be displayed.
    expect(screen.queryByText(/1\.2\.0/)).toBeNull();
  });

  it('shows just the version (no "Up To Date") when status is unknown', async () => {
    // No update check has run yet → latestVersion null. Must NOT claim up-to-date.
    apiFetch.mockImplementation(async () =>
      json({
        buildInfo: { version: '1.0.0', commit: 'abc' },
        state: { latestVersion: null, fetchError: null },
        updateAvailable: false,
      }),
    );
    render(<VersionPill />);
    await waitFor(() => expect(screen.getByText('1.0.0 (abc)')).toBeTruthy());
    expect(screen.queryByText(/Up To Date/)).toBeNull();
    expect(screen.queryByText(/Update Available/)).toBeNull();
  });

  it('shows just the version when the update check errored', async () => {
    apiFetch.mockImplementation(async () =>
      json({
        buildInfo: { version: '1.0.0', commit: 'abc' },
        state: { latestVersion: '1.0.0', fetchError: 'network down' },
        updateAvailable: false,
      }),
    );
    render(<VersionPill />);
    await waitFor(() => expect(screen.getByText('1.0.0 (abc)')).toBeTruthy());
    expect(screen.queryByText(/Up To Date/)).toBeNull();
  });
});
