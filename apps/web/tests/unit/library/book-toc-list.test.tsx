// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { BookTocList } from '@/app/(app)/library/[id]/tabs/ChaptersTab';

describe('BookTocList', () => {
  it('renders a jump link per epub/pdf entry pointing at the reader with ?loc=', () => {
    render(
      <BookTocList
        fileId={42}
        entries={[
          { title: 'Chapter One', loc: 'spine:0' },
          { title: 'Chapter Two', loc: 'spine:3' },
        ]}
      />,
    );
    expect(screen.getByText('Chapter One')).toBeTruthy();
    expect(screen.getByText('Chapter Two')).toBeTruthy();
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]!.getAttribute('href')).toBe('/read/f/42?loc=spine%3A0');
    expect(links[1]!.getAttribute('href')).toBe('/read/f/42?loc=spine%3A3');
  });

  it('renders nothing when there is no present readable file (cbz/none)', () => {
    const { container } = render(<BookTocList fileId={null} entries={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when entries are empty', () => {
    const { container } = render(<BookTocList fileId={7} entries={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
