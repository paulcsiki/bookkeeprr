/** @vitest-environment jsdom */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LogFilesViewer } from '@/app/(app)/settings/logs/LogFilesViewer';

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

describe('LogFilesViewer', () => {
  it('renders the file list', () => {
    render(
      <LogFilesViewer
        initialFiles={[
          { name: 'bookkeeprr-2026-05-25.log', sizeBytes: 1024, mtime: 1700000000000 },
        ]}
      />,
    );
    expect(screen.getByText('bookkeeprr-2026-05-25.log')).toBeTruthy();
  });

  it('renders empty state when no files', () => {
    render(<LogFilesViewer initialFiles={[]} />);
    expect(screen.getByText(/No log files yet/i)).toBeTruthy();
  });
});
