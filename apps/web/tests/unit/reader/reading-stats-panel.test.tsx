// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ReadingStatsPanel } from '@/components/reader/ReadingStatsPanel';
import type { ReadingStats } from '@/components/reader/hooks/useReadingStats';

const mockUseReadingStats = vi.fn();
vi.mock('@/components/reader/hooks/useReadingStats', () => ({
  useReadingStats: () => mockUseReadingStats(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function statsFixture(): ReadingStats {
  return {
    days: [
      { day: '2026-05-24', secondsRead: 600, unitsRead: 10 },
      { day: '2026-05-25', secondsRead: 0, unitsRead: 0 },
      { day: '2026-05-26', secondsRead: 1200, unitsRead: 20 },
      { day: '2026-05-27', secondsRead: 300, unitsRead: 5 },
      { day: '2026-05-28', secondsRead: 900, unitsRead: 15 },
      { day: '2026-05-29', secondsRead: 0, unitsRead: 0 },
      { day: '2026-05-30', secondsRead: 1800, unitsRead: 30 },
    ],
    totalSeconds: 4800,
    totalUnits: 85,
    streak: 3,
    pacePerHour: 63.75,
  };
}

describe('ReadingStatsPanel', () => {
  it('renders nothing when there is no reading at all', () => {
    mockUseReadingStats.mockReturnValue({
      data: {
        days: [{ day: '2026-05-30', secondsRead: 0, unitsRead: 0 }],
        totalSeconds: 0,
        totalUnits: 0,
        streak: 0,
        pacePerHour: null,
      },
      isLoading: false,
    });
    const { container } = render(<ReadingStatsPanel />);
    expect(container.innerHTML).toBe('');
  });

  it('renders real totals, streak, and a 7-bar weekly chart', () => {
    mockUseReadingStats.mockReturnValue({ data: statsFixture(), isLoading: false });
    render(<ReadingStatsPanel />);

    // Streak shows the real value.
    expect(screen.getByText('3')).toBeTruthy();
    // Seven day bars in the chart.
    expect(screen.getAllByTestId('stats-bar')).toHaveLength(7);
    // Total time is surfaced (4800s = 1h 20m).
    expect(screen.getByText(/1h 20m/)).toBeTruthy();
  });
});
