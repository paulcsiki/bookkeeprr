/** @vitest-environment jsdom */
import { describe, expect, it, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import { ModeProvider, ThemePicker } from '@bookkeeprr/ui';
import { ThemeProvider } from '@/components/ThemeProvider';

// next-themes calls window.matchMedia in a useEffect; provide a minimal stub.
beforeAll(() => {
  if (typeof window.matchMedia === 'undefined') {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }
});

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <ModeProvider>
      <ThemeProvider>{children}</ThemeProvider>
    </ModeProvider>
  );
}

describe('ThemePicker', () => {
  it('renders all 8 accent swatches', () => {
    const { container } = render(
      <Wrap>
        <ThemePicker />
      </Wrap>,
    );
    expect(container.querySelectorAll('button[role="radio"]')).toHaveLength(8);
  });
});
