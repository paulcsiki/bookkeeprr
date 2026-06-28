// Global toast queue, tracked in a zustand store. Toasts are enqueued imperatively
// via `toast(...)` (from anywhere, inside or outside React) and dismissed by id.
// The UI that renders the queue lands separately; this module is the state only.
//
// Project rule: never call Date.now()/Math.random()/argless new Date() — toast ids
// come from a module-level incrementing counter so they're deterministic + testable.

import { create } from 'zustand';

export type ToastTone = 'info' | 'ok' | 'err';

export interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
  durationMs: number;
}

export const useToasts = create<{ toasts: ToastItem[] }>(() => ({ toasts: [] }));

// Deterministic id source — monotonically increasing, no random/time.
let seq = 0;
function nextId(): string {
  return String(++seq);
}

/**
 * Enqueue a toast. Coalesces: if the queue's last toast has the same `message`,
 * the duplicate is dropped (avoids spamming identical consecutive toasts).
 */
export function toast({
  message,
  tone = 'info',
  durationMs = 3000,
}: {
  message: string;
  tone?: ToastTone;
  durationMs?: number;
}): void {
  const { toasts } = useToasts.getState();
  const last = toasts[toasts.length - 1];
  if (last && last.message === message) return;
  const item: ToastItem = { id: nextId(), message, tone, durationMs };
  useToasts.setState({ toasts: [...toasts, item] });
}

/** Remove the toast with the given id from the queue. */
export function dismissToast(id: string): void {
  useToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}
