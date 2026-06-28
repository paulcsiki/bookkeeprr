/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContentTypeFilter } from '@bookkeeprr/ui';

const COUNTS = { manga: 3, light_novel: 0, comic: 2, ebook: 0, audiobook: 5 } as const;

describe('ContentTypeFilter', () => {
  it('renders All + 5 type chips in fixed order', () => {
    render(<ContentTypeFilter counts={COUNTS} selected="all" onSelect={() => {}} />);
    const chips = screen.getAllByRole('button');
    expect(chips.map((c) => c.textContent)).toEqual([
      'All10',
      'Manga3',
      'Novel0',
      'Comic2',
      'eBook0',
      'Audio5',
    ]);
  });

  it('All chip count = sum of type counts', () => {
    render(<ContentTypeFilter counts={COUNTS} selected="all" onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: /All/ }).textContent).toContain('10');
  });

  it('selected chip carries `.on.<type>` class', () => {
    const { container } = render(
      <ContentTypeFilter counts={COUNTS} selected="manga" onSelect={() => {}} />,
    );
    const manga = container.querySelector('.chip.manga')!;
    expect(manga.classList.contains('on')).toBe(true);
    const all = container.querySelector('.chip.all')!;
    expect(all.classList.contains('on')).toBe(false);
  });

  it('zero-count chip carries `.zero` and ignores clicks', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <ContentTypeFilter counts={COUNTS} selected="all" onSelect={onSelect} />,
    );
    const novel = container.querySelector('.chip.novel')!;
    expect(novel.classList.contains('zero')).toBe(true);
    fireEvent.click(novel);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('clicking a non-zero type chip fires onSelect with that key', () => {
    const onSelect = vi.fn();
    render(<ContentTypeFilter counts={COUNTS} selected="all" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /Manga/ }));
    expect(onSelect).toHaveBeenCalledWith('manga');
  });

  it('clicking All fires onSelect with "all"', () => {
    const onSelect = vi.fn();
    render(<ContentTypeFilter counts={COUNTS} selected="manga" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /All/ }));
    expect(onSelect).toHaveBeenCalledWith('all');
  });
});
