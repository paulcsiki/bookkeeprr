// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useUnsavedChanges } from '@/components/hooks/useUnsavedChanges';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

describe('useUnsavedChanges', () => {
  beforeEach(() => {
    push.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not prompt and returns true when not dirty', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { result } = renderHook(() => useUnsavedChanges(false));
    expect(result.current.confirmIfDirty()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('prompts via window.confirm when dirty and returns its result', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { result } = renderHook(() => useUnsavedChanges(true));
    expect(result.current.confirmIfDirty()).toBe(true);
    expect(confirm).toHaveBeenCalledOnce();

    confirm.mockReturnValue(false);
    expect(result.current.confirmIfDirty()).toBe(false);
  });

  it('adds a beforeunload listener while dirty and removes it when clean / unmounted', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');

    const { rerender, unmount } = renderHook(({ dirty }) => useUnsavedChanges(dirty), {
      initialProps: { dirty: true },
    });
    expect(add).toHaveBeenCalledWith('beforeunload', expect.any(Function));

    // Going clean removes the listener.
    rerender({ dirty: false });
    expect(remove).toHaveBeenCalledWith('beforeunload', expect.any(Function));

    // Re-dirty then unmount also removes it.
    remove.mockClear();
    rerender({ dirty: true });
    unmount();
    expect(remove).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });

  it('intercepts internal anchor clicks while dirty and navigates on confirm', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderHook(() => useUnsavedChanges(true));

    const anchor = document.createElement('a');
    anchor.setAttribute('href', '/settings/other');
    document.body.appendChild(anchor);

    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    anchor.dispatchEvent(event);

    expect(confirm).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
    expect(push).toHaveBeenCalledWith('/settings/other');

    document.body.removeChild(anchor);
  });

  it('blocks internal anchor navigation when confirm is declined', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderHook(() => useUnsavedChanges(true));

    const anchor = document.createElement('a');
    anchor.setAttribute('href', '/settings/other');
    document.body.appendChild(anchor);

    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    anchor.dispatchEvent(event);

    expect(confirm).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
    expect(push).not.toHaveBeenCalled();

    document.body.removeChild(anchor);
  });

  it('ignores external links and modifier-clicks', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderHook(() => useUnsavedChanges(true));

    const ext = document.createElement('a');
    ext.setAttribute('href', 'https://example.com');
    document.body.appendChild(ext);
    ext.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    expect(confirm).not.toHaveBeenCalled();

    const internal = document.createElement('a');
    internal.setAttribute('href', '/x');
    document.body.appendChild(internal);
    internal.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, metaKey: true }),
    );
    expect(confirm).not.toHaveBeenCalled();

    document.body.removeChild(ext);
    document.body.removeChild(internal);
  });
});
