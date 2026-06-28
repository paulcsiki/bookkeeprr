/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ModeProvider, useMode } from '@bookkeeprr/ui';

function Wrap({ children }: { children: React.ReactNode }) {
  return <ModeProvider>{children}</ModeProvider>;
}

describe('useMode', () => {
  beforeEach(() => {
    localStorage.removeItem('bookkeeprr-mode');
    document.documentElement.removeAttribute('data-mode');
  });

  it('defaults to system mode', () => {
    const { result } = renderHook(() => useMode(), { wrapper: Wrap });
    expect(result.current.mode).toBe('system');
  });

  it('persists the chosen mode to localStorage', () => {
    const { result } = renderHook(() => useMode(), { wrapper: Wrap });
    act(() => result.current.setMode('light'));
    expect(localStorage.getItem('bookkeeprr-mode')).toBe('light');
  });

  it('writes data-mode to <html> for light/dark', () => {
    const { result } = renderHook(() => useMode(), { wrapper: Wrap });
    act(() => result.current.setMode('light'));
    expect(document.documentElement.getAttribute('data-mode')).toBe('light');
    act(() => result.current.setMode('dark'));
    expect(document.documentElement.getAttribute('data-mode')).toBe('dark');
  });

  it('effectiveMode resolves system to matched media', () => {
    const { result } = renderHook(() => useMode(), { wrapper: Wrap });
    act(() => result.current.setMode('system'));
    // jsdom matchMedia returns false for prefers-color-scheme:light → effective is dark
    expect(result.current.effectiveMode).toBe('dark');
  });
});
