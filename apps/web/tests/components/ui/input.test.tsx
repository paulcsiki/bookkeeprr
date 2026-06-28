/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Input } from '@/components/ui/input';

describe('Input', () => {
  it('forces single-line + ellipsis on overflow', () => {
    const { container } = render(<Input defaultValue="x" />);
    const input = container.querySelector('input')!;
    expect(input.className).toMatch(/truncate/);
  });
});
