/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  BreadcrumbLabelProvider,
  useBreadcrumbLabel,
  useBreadcrumbLabels,
} from '@/components/shell/BreadcrumbLabels';

function Registrar({ href, label }: { href: string; label: string }): null {
  useBreadcrumbLabel(href, label);
  return null;
}

function Consumer(): React.JSX.Element {
  const labels = useBreadcrumbLabels();
  return <div data-testid="labels">{JSON.stringify(labels)}</div>;
}

describe('BreadcrumbLabels', () => {
  it('registers a label without an infinite render loop', () => {
    // Regression: useBreadcrumbLabel depended on the whole context value object,
    // which changed on every setLabel → infinite "Maximum update depth" loop.
    // If that regresses, this render throws rather than settling.
    render(
      <BreadcrumbLabelProvider>
        <Registrar href="/library/2" label="Bunny Drop" />
        <Consumer />
      </BreadcrumbLabelProvider>,
    );
    expect(screen.getByTestId('labels').textContent).toBe(
      JSON.stringify({ '/library/2': 'Bunny Drop' }),
    );
  });

  it('returns an empty map when no label is registered', () => {
    render(
      <BreadcrumbLabelProvider>
        <Consumer />
      </BreadcrumbLabelProvider>,
    );
    expect(screen.getByTestId('labels').textContent).toBe('{}');
  });
});
