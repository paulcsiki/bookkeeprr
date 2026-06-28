/** @vitest-environment jsdom */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AuditEventsTable } from '@/app/(app)/settings/audit/AuditEventsTable';

function row(overrides: Record<string, unknown>): never {
  return {
    id: 1,
    timestamp: new Date(1700000000000),
    actorKind: 'user',
    actorUserId: 1,
    actorUsername: 'admin',
    action: 'auth.login_success',
    targetKind: null,
    targetId: null,
    metadataJson: null,
    peerIp: null,
    clientIp: null,
    userAgent: null,
    ...overrides,
  } as never;
}

// @tanstack/react-virtual measures offsetHeight via the DOM.
// jsdom always returns 0, so we stub it to 600px so virtual rows are rendered.
let originalOffsetHeight: PropertyDescriptor | undefined;
beforeAll(() => {
  originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() {
      return 600;
    },
  });
});
afterAll(() => {
  if (originalOffsetHeight) {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight);
  }
});

describe('AuditEventsTable', () => {
  it('renders rows from initial props', () => {
    render(<AuditEventsTable initialRows={[row({})]} initialTotal={1} />);
    expect(screen.getByText('auth.login_success')).toBeTruthy();
    expect(screen.getByText('admin')).toBeTruthy();
  });

  it('expands a row to reveal the full metadata property list', () => {
    render(
      <AuditEventsTable
        initialRows={[
          row({
            metadataJson: JSON.stringify({
              changedFields: ['title', 'status'],
              reason: 'manual edit',
              extra: { nested: true },
            }),
          }),
        ]}
        initialTotal={1}
      />,
    );

    const toggle = screen.getByRole('button', { name: 'Expand details' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(toggle);

    const expanded = screen.getByRole('button', { name: 'Collapse details' });
    expect(expanded.getAttribute('aria-expanded')).toBe('true');
    // Full dump shows the nested object value as compact JSON. (Preview also
    // renders it, so both the compact + expanded copies are present.)
    expect(screen.getAllByText('{"nested":true}').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('manual edit').length).toBeGreaterThanOrEqual(1);

    fireEvent.click(expanded);
    expect(screen.getByRole('button', { name: 'Expand details' }).getAttribute('aria-expanded')).toBe(
      'false',
    );
  });
});
