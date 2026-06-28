import { onlineManager } from '@tanstack/react-query';
import { wireOnlineManager } from '@/state/onlineManagerBridge';
import { useConnectivity, deriveIsOnline } from '@/state/connectivityStore';

// The app wiring under test: a bridge that mirrors the connectivity store's
// derived online value into TanStack Query's `onlineManager`, so paused queries
// resume (and `refetchOnReconnect` fires) when the device/server come back.
// Extracted into its own module so it's unit-testable without mounting the app.

describe('wireOnlineManager', () => {
  let unsub: (() => void) | null = null;

  beforeEach(() => {
    useConnectivity.setState({ deviceOnline: true, serverReachable: null, lastPingAt: 0 });
  });

  afterEach(() => {
    unsub?.();
    unsub = null;
  });

  it('seeds onlineManager from the store and tracks subsequent transitions', () => {
    // Sanity: the seeded store derives online.
    expect(deriveIsOnline(useConnectivity.getState())).toBe(true);

    unsub = wireOnlineManager();
    expect(onlineManager.isOnline()).toBe(true);

    useConnectivity.setState({ deviceOnline: false, serverReachable: false });
    expect(onlineManager.isOnline()).toBe(false);

    useConnectivity.setState({ deviceOnline: true, serverReachable: true });
    expect(onlineManager.isOnline()).toBe(true);
  });

  it('stops tracking after the returned unsubscribe runs', () => {
    unsub = wireOnlineManager();
    expect(onlineManager.isOnline()).toBe(true);

    unsub();
    unsub = null;

    useConnectivity.setState({ deviceOnline: false, serverReachable: false });
    expect(onlineManager.isOnline()).toBe(true);
  });
});
