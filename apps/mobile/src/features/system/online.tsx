// Online gating primitives consumed by the offline-mode features (SP2–SP4).
// `<OnlineOnly>` renders its children when the app is online and a fallback
// when offline; `useOnlineGate` wraps a server action so that offline it toasts
// "Unavailable offline" and no-ops instead of firing. Both read the reactive
// `useIsOnline()` derivation from the connectivity store.

import type { ReactNode } from 'react';
import { useIsOnline } from '@/state/connectivityStore';
import { toast } from '@/state/toastStore';

export { useIsOnline } from '@/state/connectivityStore';

export function OnlineOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return <>{useIsOnline() ? children : fallback}</>;
}

export function useOnlineGate() {
  const online = useIsOnline();
  function gate<T extends (...args: never[]) => unknown>(fn: T): (...args: Parameters<T>) => ReturnType<T> | void {
    return (...args) => {
      if (!online) {
        toast({ message: 'Unavailable offline' });
        return;
      }
      return fn(...args) as ReturnType<T>;
    };
  }
  return { online, gate, disabledProps: { disabled: !online } };
}
