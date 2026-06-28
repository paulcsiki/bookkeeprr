/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModeProvider, AppearanceDialog } from '@bookkeeprr/ui';
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

describe('AppearanceDialog', () => {
  beforeEach(() => localStorage.clear());

  it('renders Light / Dark / System mode cards when open', () => {
    render(
      <Wrap>
        <AppearanceDialog open onOpenChange={() => {}} />
      </Wrap>,
    );
    expect(screen.getByRole('button', { name: /light/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /dark/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /system/i })).toBeTruthy();
  });

  it('renders 8 accent swatches and disables Shiro on light mode', () => {
    render(
      <Wrap>
        <AppearanceDialog open onOpenChange={() => {}} />
      </Wrap>,
    );
    fireEvent.click(screen.getByRole('button', { name: /light/i }));
    const shiro = screen.getByRole('button', { name: /shiro/i });
    expect(shiro.hasAttribute('disabled')).toBe(true);
  });

  it('disables Sumi on dark mode', () => {
    render(
      <Wrap>
        <AppearanceDialog open onOpenChange={() => {}} />
      </Wrap>,
    );
    fireEvent.click(screen.getByRole('button', { name: /dark/i }));
    const sumi = screen.getByRole('button', { name: /sumi/i });
    expect(sumi.hasAttribute('disabled')).toBe(true);
  });
});
