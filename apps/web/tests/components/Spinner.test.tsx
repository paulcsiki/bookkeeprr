/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Spinner } from '@bookkeeprr/ui';

describe('Spinner', () => {
  it('renders with role="status" and a default size', () => {
    render(<Spinner />);
    const el = screen.getByRole('status');
    expect(el.className).toMatch(/spinner/);
    expect(el.className).not.toMatch(/spinner-lg/);
  });

  it('renders the large variant when size="lg"', () => {
    render(<Spinner size="lg" />);
    const el = screen.getByRole('status');
    expect(el.className).toMatch(/spinner-lg/);
  });

  it('exposes an accessible label', () => {
    render(<Spinner />);
    expect(screen.getByRole('status').getAttribute('aria-label')).toMatch(/loading/i);
  });
});
