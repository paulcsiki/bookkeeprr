/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '@/components/ui/button';

describe('Button loading', () => {
  it('renders a spinner when loading and is disabled', () => {
    render(<Button loading>Grabbing…</Button>);
    const btn = screen.getByRole('button');
    expect(btn.hasAttribute('disabled')).toBe(true);
    expect(btn.querySelector('.spinner')).not.toBeNull();
  });

  it('hides the spinner when not loading', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button').querySelector('.spinner')).toBeNull();
  });
});
