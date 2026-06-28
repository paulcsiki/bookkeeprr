/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UpdatesForm, formatUptime } from '@/app/(app)/settings/updates/UpdatesForm';

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: vi.fn(async () => new Response('{}', { status: 200 })),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('@/components/VersionHistoryDialog', () => ({
  VersionHistoryDialog: () => null,
}));

const DEFAULT_INITIAL = {
  config: {
    frequency: 'daily' as const,
    behavior: 'notify' as const,
    notifyOnIntegrations: false,
    showChangelogOnFirstLaunch: true,
  },
  state: {
    latestVersion: null,
    latestReleaseUrl: null,
    fetchedAt: null,
    fetchError: null,
  },
  override: { mode: 'auto' as const },
  detected: 'standalone' as const,
  effectiveMode: 'standalone' as const,
  buildInfo: {
    version: '1.0.0',
    commit: 'abc1234',
    builtAt: '2026-05-01',
    channel: 'stable',
    runtime: 'Node 22 · Next 15',
    uptime: 3723,
  },
};

describe('UpdatesForm — frequency segmented control', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders all 4 frequency buttons', () => {
    render(<UpdatesForm initial={DEFAULT_INITIAL} />);
    expect(screen.getByTestId('freq-off')).toBeTruthy();
    expect(screen.getByTestId('freq-hourly')).toBeTruthy();
    expect(screen.getByTestId('freq-daily')).toBeTruthy();
    expect(screen.getByTestId('freq-weekly')).toBeTruthy();
  });

  it('marks the current frequency as active', () => {
    render(<UpdatesForm initial={DEFAULT_INITIAL} />);
    const dailyBtn = screen.getByTestId('freq-daily');
    expect(dailyBtn.className).toContain('bg-primary');
  });

  it('calls apiFetch with the new frequency on click', async () => {
    const { apiFetch } = await import('@/lib/api-fetch');
    render(<UpdatesForm initial={DEFAULT_INITIAL} />);
    fireEvent.click(screen.getByTestId('freq-weekly'));
    expect(apiFetch).toHaveBeenCalledWith(
      '/api/settings/updates',
      expect.objectContaining({ body: JSON.stringify({ frequency: 'weekly' }) }),
    );
  });
});

describe('UpdatesForm — behavior segmented control', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders all 3 behavior buttons', () => {
    render(<UpdatesForm initial={DEFAULT_INITIAL} />);
    expect(screen.getByTestId('behavior-notify')).toBeTruthy();
    expect(screen.getByTestId('behavior-auto-download')).toBeTruthy();
    expect(screen.getByTestId('behavior-auto-install')).toBeTruthy();
  });

  it('does NOT show the fallback note when behavior=notify', () => {
    render(<UpdatesForm initial={DEFAULT_INITIAL} />);
    expect(screen.queryByText(/falls back to notify/i)).toBeNull();
  });

  it('shows the fallback note when behavior=auto-download', () => {
    render(
      <UpdatesForm
        initial={{ ...DEFAULT_INITIAL, config: { ...DEFAULT_INITIAL.config, behavior: 'auto-download' } }}
      />,
    );
    expect(screen.getByText(/falls back to notify/i)).toBeTruthy();
  });

  it('calls apiFetch with the new behavior on click', async () => {
    const { apiFetch } = await import('@/lib/api-fetch');
    render(<UpdatesForm initial={DEFAULT_INITIAL} />);
    fireEvent.click(screen.getByTestId('behavior-auto-install'));
    expect(apiFetch).toHaveBeenCalledWith(
      '/api/settings/updates',
      expect.objectContaining({ body: JSON.stringify({ behavior: 'auto-install' }) }),
    );
  });
});

describe('UpdatesForm — uptime row', () => {
  it('displays the formatted uptime in the Build & runtime section', () => {
    render(<UpdatesForm initial={DEFAULT_INITIAL} />);
    // 3723 seconds = 1h 2m
    expect(screen.getByText('1h 2m')).toBeTruthy();
  });
});

describe('formatUptime()', () => {
  it('formats seconds-only as Xm', () => {
    expect(formatUptime(0)).toBe('0m');
    expect(formatUptime(59)).toBe('0m');
    expect(formatUptime(61)).toBe('1m');
  });

  it('formats hours+minutes when < 1 day', () => {
    expect(formatUptime(3600)).toBe('1h 0m');
    expect(formatUptime(3723)).toBe('1h 2m');
    expect(formatUptime(86399)).toBe('23h 59m');
  });

  it('includes days when >= 1 day', () => {
    expect(formatUptime(86400)).toBe('1d 0h 0m');
    expect(formatUptime(90061)).toBe('1d 1h 1m');
    expect(formatUptime(172800)).toBe('2d 0h 0m');
  });
});
