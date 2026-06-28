/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FinishedView } from '@/components/reader/FinishedView';

const manifest = {
  title: 'Vinland Saga',
  kind: 'comics' as const,
  coverUrl: undefined,
  readableKey: 'page:file:1',
  contentType: 'manga',
  reader: 'comics' as const,
  format: 'cbz' as const,
  seriesId: 1,
  progress: {
    readableKey: 'page:file:1',
    position: 1,
    locator: null,
    finished: true,
    restartedFromFinish: false,
  },
};

describe('FinishedView', () => {
  it('renders title + 4 stats + Up next card + actions', () => {
    const onStartOver = vi.fn();
    const onStartNext = vi.fn();
    const onBackToLibrary = vi.fn();
    render(
      <FinishedView
        manifest={manifest as never}
        stats={{ finishedAt: new Date(), minutesRead: 312, pages: 224, paceLabel: '12 pp/day' }}
        upNext={{ title: 'Vinland Saga Vol. 28', href: '/read/v/2', kind: 'manga' }}
        onStartOver={onStartOver}
        onStartNext={onStartNext}
        onBackToLibrary={onBackToLibrary}
      />,
    );
    expect(screen.getByText('Vinland Saga')).toBeTruthy();
    expect(screen.getAllByText(/Vinland Saga Vol. 28/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    expect(onStartNext).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /back to library/i }));
    expect(onBackToLibrary).toHaveBeenCalledTimes(1);
  });

  it('falls back to Start over when no upNext', () => {
    const onStartOver = vi.fn();
    const onBackToLibrary = vi.fn();
    render(
      <FinishedView
        manifest={manifest as never}
        stats={{ finishedAt: new Date(), minutesRead: 312, pages: 224, paceLabel: '12 pp/day' }}
        onStartOver={onStartOver}
        onBackToLibrary={onBackToLibrary}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /start over/i }));
    expect(onStartOver).toHaveBeenCalledTimes(1);
  });
});
