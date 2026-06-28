// The side-effecting connectivity monitor. It wires three sources into the pure
// `useConnectivity` store + the toast queue:
//
//   1. NetInfo  — device link state → `setDeviceOnline`; a transition INTO
//      connected kicks a (throttled) server health-ping.
//   2. AppState — foregrounding ('active') kicks a (throttled) health-ping so a
//      device that came back from background re-confirms reachability.
//   3. The store itself — a DEBOUNCED (~1s) stable change in the derived online
//      value fires a user-facing transition toast ("You're offline" / "Back
//      online"). The very first value is suppressed so startup is silent, and a
//      transition that reverts within the debounce window fires nothing.
//
// Project rule: no Date.now()/Math.random() in testable units. The current time
// is injected via `now` (default thunk reads Date.now() only as an injection
// seam — tests always pass their own). The pure `shouldPing` throttle lives in
// connectivityStore.
//
// This module is NOT a React component; it reads the server URL via the auth
// token store (non-React `tokenStore.load()`), not a hook.

import { AppState, type NativeEventSubscription } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { tokenStore } from '@/auth/token-store';
import { deriveIsOnline, shouldPing, useConnectivity } from './connectivityStore';
import { toast } from './toastStore';

/** Debounce window for the transition toast — a change must stay stable this long. */
export const TRANSITION_DEBOUNCE_MS = 1_000;

/** Health-ping request timeout. */
const PING_TIMEOUT_MS = 5_000;

interface MonitorOptions {
  /** Injected clock (ms). Default reads Date.now() — overridden in tests. */
  now?: () => number;
  /** Injected server-URL getter. Default reads it from the auth token store. */
  getServerUrl?: () => Promise<string | null> | string | null;
}

const defaultNow = (): number => Date.now();
const defaultGetServerUrl = async (): Promise<string | null> => {
  const creds = await tokenStore.load();
  return creds?.serverUrl ?? null;
};

// Module-scoped state — the active subscriptions, the debounce timer, the
// injected deps, and the last-emitted online value for transition detection.
let netInfoUnsub: (() => void) | null = null;
let appStateSub: NativeEventSubscription | null = null;
let storeUnsub: (() => void) | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

let nowFn: () => number = defaultNow;
let getServerUrlFn: () => Promise<string | null> | string | null = defaultGetServerUrl;

// `null` until the first store change is observed; used to suppress the initial
// emission and to detect a *stable* change vs the last toasted value.
let lastEmittedOnline: boolean | null = null;
// What the debounce timer is currently scheduled to settle to. If a later change
// reverts to `lastEmittedOnline` before the timer fires, the timer is cancelled.
let pendingOnline: boolean | null = null;

/** Fire a server health-ping if the throttle allows. Reads serverUrl via the getter. */
export async function pingNow(): Promise<void> {
  const serverUrl = await getServerUrlFn();
  if (!serverUrl) return; // not signed in / no server — nothing to probe.

  const now = nowFn();
  const { getState } = useConnectivity;
  if (!shouldPing(getState(), now)) return;

  const url = serverUrl.replace(/\/$/, '') + '/api/health';
  // Mirror the api client's abort-via-controller pattern (AbortSignal.timeout
  // isn't in this project's TS lib); abort after PING_TIMEOUT_MS.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    await fetch(url, { method: 'GET', signal: controller.signal });
    // Any settled Response (even a 5xx) means the server is reachable.
    useConnectivity.getState().noteServerReachable(true);
  } catch {
    // Network error / abort / timeout → server is not reachable.
    useConnectivity.getState().noteServerReachable(false);
  } finally {
    clearTimeout(timer);
    useConnectivity.getState().markPing(now);
  }
}

/** Alias used by the AppState 'active' handler; throttle guard lives in pingNow. */
function maybePing(): void {
  void pingNow();
}

function onStoreChange(): void {
  const online = deriveIsOnline(useConnectivity.getState());

  // No change vs the last *toasted* value: cancel any in-flight debounce (a
  // transition that reverted within the window fires nothing).
  if (online === lastEmittedOnline) {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
      pendingOnline = null;
    }
    return;
  }

  // A change is already pending for this same value — let it ride.
  if (debounceTimer && pendingOnline === online) return;

  // (Re)schedule the debounce for the new target value.
  if (debounceTimer) clearTimeout(debounceTimer);
  pendingOnline = online;
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    pendingOnline = null;
    lastEmittedOnline = online;
    if (online) {
      toast({ message: 'Back online', tone: 'ok' });
    } else {
      toast({ message: "You're offline — showing downloaded items", tone: 'info' });
    }
  }, TRANSITION_DEBOUNCE_MS);
}

/** Start the monitor: subscribe NetInfo, AppState, and the connectivity store. */
export function startConnectivityMonitor(opts?: MonitorOptions): void {
  // Idempotent: tear down any prior run first.
  stopConnectivityMonitor();

  nowFn = opts?.now ?? defaultNow;
  getServerUrlFn = opts?.getServerUrl ?? defaultGetServerUrl;

  // Seed the transition baseline with the CURRENT derived value so startup is
  // silent (the initial value is suppressed) and any later store change is
  // measured as a real transition against it. NetInfo's initial emission often
  // does not change the derived value, so we cannot rely on the first
  // subscription callback to establish the baseline.
  lastEmittedOnline = deriveIsOnline(useConnectivity.getState());

  let prevConnected: boolean | null = null;
  netInfoUnsub = NetInfo.addEventListener((state) => {
    const connected = !!state.isConnected && state.isInternetReachable !== false;
    useConnectivity.getState().setDeviceOnline(connected);
    // On a transition INTO device-connected, re-confirm the server.
    if (connected && prevConnected !== true) {
      void pingNow();
    }
    prevConnected = connected;
  });

  appStateSub = AppState.addEventListener('change', (status) => {
    if (status === 'active') maybePing();
  });

  storeUnsub = useConnectivity.subscribe(onStoreChange);
}

/** Stop the monitor: unsubscribe everything + clear the debounce timer. */
export function stopConnectivityMonitor(): void {
  netInfoUnsub?.();
  netInfoUnsub = null;
  appStateSub?.remove();
  appStateSub = null;
  storeUnsub?.();
  storeUnsub = null;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  pendingOnline = null;
  lastEmittedOnline = null;
}
