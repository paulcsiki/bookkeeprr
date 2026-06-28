/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HandoffCard } from '@/components/reader/HandoffCard';

describe('HandoffCard', () => {
  it('renders device + chapter + percent + Resume', () => {
    const onResume = vi.fn();
    render(
      <HandoffCard
        deviceName="iPhone"
        position={0.41}
        chapter="Ch. 12"
        lastSyncedAgo="3 min ago"
        onResume={onResume}
      />,
    );
    expect(screen.getByText(/Continue from your iPhone/)).toBeTruthy();
    expect(screen.getByText(/Ch. 12/)).toBeTruthy();
    expect(screen.getByText(/41%/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /resume/i }));
    expect(onResume).toHaveBeenCalledTimes(1);
  });
});
