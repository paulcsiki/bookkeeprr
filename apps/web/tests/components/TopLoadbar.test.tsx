/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TopLoadbar } from '@bookkeeprr/ui';

describe('TopLoadbar', () => {
  it('renders the bar when visible', () => {
    render(<TopLoadbar visible />);
    const el = screen.getByRole('progressbar');
    expect(el.className).toMatch(/loadbar/);
  });

  it('renders nothing when not visible', () => {
    const { container } = render(<TopLoadbar visible={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('is hidden by default', () => {
    const { container } = render(<TopLoadbar />);
    expect(container.firstChild).toBeNull();
  });
});
