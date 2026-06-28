/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from '@bookkeeprr/ui';

const Icon = () => <svg data-testid="icon" />;

describe('EmptyState', () => {
  it('renders icon, title, body, and actions', () => {
    render(
      <EmptyState
        icon={<Icon />}
        title="Your library is empty"
        body="Add your first series."
        actions={<button>Add series</button>}
      />,
    );
    expect(screen.getByTestId('icon')).toBeTruthy();
    expect(screen.getByText('Your library is empty')).toBeTruthy();
    expect(screen.getByText('Add your first series.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add series' })).toBeTruthy();
  });

  it('applies the variant class for muted / ok / err', () => {
    const variants: Array<['muted' | 'ok' | 'err', string]> = [
      ['muted', 'muted'],
      ['ok', 'ok'],
      ['err', 'err'],
    ];
    for (const [v, klass] of variants) {
      const { container } = render(<EmptyState variant={v} icon={<Icon />} title="t" />);
      expect(container.querySelector('.empty')?.className).toMatch(new RegExp(klass));
    }
  });

  it('wraps in es-stage by default and omits with staged=false', () => {
    const { container, rerender } = render(<EmptyState icon={<Icon />} title="t" />);
    expect(container.querySelector('.es-stage')).not.toBeNull();
    rerender(<EmptyState icon={<Icon />} title="t" staged={false} />);
    expect(container.querySelector('.es-stage')).toBeNull();
    expect(container.querySelector('.empty')).not.toBeNull();
  });

  it('renders the scrim label when provided', () => {
    render(<EmptyState icon={<Icon />} title="t" scrimLabel="First run · library" />);
    expect(screen.getByText('First run · library')).toBeTruthy();
  });

  it('renders the hint when provided', () => {
    render(<EmptyState icon={<Icon />} title="t" hint="or press ⌘K" />);
    expect(screen.getByText('or press ⌘K')).toBeTruthy();
  });
});
