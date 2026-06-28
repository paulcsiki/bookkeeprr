// Minimal singleton event bus that lets non-rn-firebase code paths (notably the
// Maestro e2e bootstrap) inject synthetic foreground push messages into
// `InAppBanner` without going through the native messaging plumbing.
//
// In production the bus is dormant: only `messaging().onMessage()` fires. The
// e2e build flips on a timer that calls `pushEventBus.emit(...)` to verify
// banner rendering + deep-link tap behaviour end-to-end.

export type PushBannerMessage = {
  title: string;
  body: string;
  deepLink: string | null;
};

type Listener = (msg: PushBannerMessage) => void;

const listeners = new Set<Listener>();

export const pushEventBus = {
  on(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  emit(msg: PushBannerMessage): void {
    listeners.forEach((l) => l(msg));
  },
};
