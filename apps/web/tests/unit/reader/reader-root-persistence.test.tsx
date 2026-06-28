// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { ReaderRoot } from '@/components/reader/ReaderRoot';
import { useReaderTheme } from '@/components/reader/ReaderContext';
import { loadReaderSettings } from '@/components/reader/lib/reader-settings-storage';

const KEY = 'bookkeeprr-reader-settings:comics';

/** Probe child exposing the theme context for assertions + actions. */
function Probe() {
  const theme = useReaderTheme();
  return (
    <div>
      <span data-testid="probe-theme">{theme.themeKey}</span>
      <span data-testid="probe-auto">{String(theme.auto)}</span>
      <button type="button" onClick={() => theme.setTheme('sepia')}>
        pick-sepia
      </button>
      <button type="button" onClick={() => theme.setAuto(true)}>
        pick-auto
      </button>
    </div>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  cleanup();
});

describe('ReaderRoot persistence', () => {
  it('keeps the per-content-type seed when nothing is persisted', () => {
    render(
      <ReaderRoot initialTheme="oled" initialAuto={false} persistKind="comics" dataTestId="root">
        <Probe />
      </ReaderRoot>,
    );
    expect(screen.getByTestId('probe-theme').textContent).toBe('oled');
    expect(screen.getByTestId('root').getAttribute('data-reader-theme')).toBe('oled');
    // Mounting alone must not write anything — seeds stay seeds.
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it('hydrates a persisted theme over the seed after mount', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ themeKey: 'paper', auto: false }));
    render(
      <ReaderRoot initialTheme="oled" initialAuto={false} persistKind="comics" dataTestId="root">
        <Probe />
      </ReaderRoot>,
    );
    expect(screen.getByTestId('probe-theme').textContent).toBe('paper');
    expect(screen.getByTestId('root').getAttribute('data-reader-theme')).toBe('paper');
  });

  it('persists the theme on an explicit pick', () => {
    render(
      <ReaderRoot initialTheme="oled" initialAuto={false} persistKind="comics">
        <Probe />
      </ReaderRoot>,
    );
    act(() => {
      screen.getByText('pick-sepia').click();
    });
    expect(screen.getByTestId('probe-theme').textContent).toBe('sepia');
    expect(loadReaderSettings('comics')).toEqual({ themeKey: 'sepia', auto: false });
  });

  it('persists the auto toggle', () => {
    render(
      <ReaderRoot initialTheme="oled" initialAuto={false} persistKind="comics">
        <Probe />
      </ReaderRoot>,
    );
    act(() => {
      screen.getByText('pick-auto').click();
    });
    expect(screen.getByTestId('probe-auto').textContent).toBe('true');
    expect(loadReaderSettings('comics')).toEqual({ auto: true });
  });

  it('does not touch storage without a persistKind', () => {
    render(
      <ReaderRoot initialTheme="oled" initialAuto={false}>
        <Probe />
      </ReaderRoot>,
    );
    act(() => {
      screen.getByText('pick-sepia').click();
    });
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });
});
