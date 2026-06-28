// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ContinueCard } from '@/components/reader/ContinueCard';
import type { ContinueReadingItem } from '@/components/reader/hooks/useContinueReading';

function pagedItem(over: Partial<ContinueReadingItem> = {}): ContinueReadingItem {
  return {
    readableKey: 'page:file:42',
    seriesId: 7,
    volumeId: 3,
    libraryFileId: 42,
    contentType: 'manga',
    position: 0.42,
    finished: false,
    title: 'Frieren',
    coverUrl: null,
    ...over,
  };
}

function audioItem(over: Partial<ContinueReadingItem> = {}): ContinueReadingItem {
  return {
    readableKey: 'audio:vol:9',
    seriesId: 5,
    volumeId: 9,
    libraryFileId: null,
    contentType: 'audiobook',
    position: 0.5,
    finished: false,
    title: 'The Three-Body Problem',
    coverUrl: null,
    ...over,
  };
}

describe('ContinueCard', () => {
  it('renders a 42% paged item with a progress bar and a mono percentage', () => {
    const { container } = render(<ContinueCard item={pagedItem()} />);
    expect(screen.getByText('42%')).toBeTruthy();
    const bar = container.querySelector('[data-testid="continue-progress-fill"]') as HTMLElement;
    expect(bar).toBeTruthy();
    expect(bar.style.width).toBe('42%');
  });

  it('links a paged item to /read/f/<libraryFileId>', () => {
    render(<ContinueCard item={pagedItem({ libraryFileId: 42 })} />);
    const link = screen.getByRole('link') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/read/f/42');
  });

  it('links an audio item to /read/v/<volumeId>', () => {
    render(<ContinueCard item={audioItem({ volumeId: 9 })} />);
    const link = screen.getByRole('link') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/read/v/9');
  });

  it('shows the FINISHED · STARTS OVER state for a finished item', () => {
    render(<ContinueCard item={pagedItem({ finished: true, position: 1 })} />);
    expect(screen.getByText(/FINISHED · STARTS OVER/i)).toBeTruthy();
  });
});
