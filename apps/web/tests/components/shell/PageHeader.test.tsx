/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageHeader } from '@/components/shell/PageHeader';

describe('PageHeader', () => {
  it('renders the lede as its own row below the title', () => {
    const { container } = render(
      <PageHeader title="My page" subtitle="Some lede text" />,
    );
    const lede = screen.getByText('Some lede text');
    // The lede must NOT share its flex parent with the title — it's
    // a dedicated row below.
    const titleH1 = container.querySelector('h1')!;
    expect(lede.parentElement).not.toBe(titleH1.parentElement);
  });

  it('lede has max-width 720px not 540px', () => {
    render(<PageHeader title="X" subtitle="Y" />);
    const lede = screen.getByText('Y');
    // Tailwind class max-w-[720px] should be present.
    expect(lede.className).toMatch(/max-w-\[720px\]/);
  });
});
