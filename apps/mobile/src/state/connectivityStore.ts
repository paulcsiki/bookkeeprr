// Connectivity state, tracked in a zustand store. Records whether the device has
// a network link (`deviceOnline`) and whether our server has been *confirmed*
// reachable (`serverReachable`: null = not yet probed). The derivation +
// state-transition logic lives in the pure `reduce*`/`derive*`/`shouldPing`
// helpers below so it's unit-testable without the store; the store is a thin
// wrapper that applies a reducer.
//
// Project rule: reducers never call Date.now()/Math.random()/argless new Date() —
// the current time is injected (`now`/`markPing(now)`), keeping the units pure.

import { create } from 'zustand';

export interface ConnectivityState {
  deviceOnline: boolean;
  serverReachable: boolean | null; // null = unknown (not yet probed)
  lastPingAt: number;
}

/** Minimum gap between server reachability pings. */
export const PING_MIN_INTERVAL_MS = 75_000;

// ---------------------------------------------------------------------------
// Pure reducers / derivations — these never touch the store so they can be
// unit-tested directly. Each returns a NEW state (the prior state is untouched).
// ---------------------------------------------------------------------------

/** Set the device-online flag. Returns the same state when unchanged. */
export function reduceDeviceOnline(s: ConnectivityState, v: boolean): ConnectivityState {
  return s.deviceOnline === v ? s : { ...s, deviceOnline: v };
}

/** Record a confirmed server-reachable result. Returns the same state when unchanged. */
export function reduceServerReachable(s: ConnectivityState, v: boolean): ConnectivityState {
  return s.serverReachable === v ? s : { ...s, serverReachable: v };
}

/** Stamp the time of the most recent ping (injected `now`). */
export function reduceMarkPing(s: ConnectivityState, now: number): ConnectivityState {
  return { ...s, lastPingAt: now };
}

/** Online unless device down OR server *confirmed* down (unknown = online). */
export function deriveIsOnline(s: ConnectivityState): boolean {
  return s.deviceOnline && s.serverReachable !== false;
}

/** Whether enough time has elapsed since the last ping to probe again. */
export function shouldPing(s: ConnectivityState, now: number): boolean {
  return now - s.lastPingAt >= PING_MIN_INTERVAL_MS;
}

// ---------------------------------------------------------------------------
// Store — a thin wrapper that applies the reducers above.
// ---------------------------------------------------------------------------

interface ConnectivityStore extends ConnectivityState {
  setDeviceOnline: (v: boolean) => void;
  noteServerReachable: (v: boolean) => void;
  markPing: (now: number) => void;
}

export const useConnectivity = create<ConnectivityStore>((set) => ({
  deviceOnline: true,
  serverReachable: null,
  lastPingAt: 0,
  setDeviceOnline: (v) => set((s) => reduceDeviceOnline(s, v)),
  noteServerReachable: (v) => set((s) => reduceServerReachable(s, v)),
  markPing: (now) => set((s) => reduceMarkPing(s, now)),
}));

/** Reactive selector: the current online derivation. */
export function useIsOnline(): boolean {
  return useConnectivity(deriveIsOnline);
}

/** Imperative read of the current online derivation (outside React). */
export function isOnlineNow(): boolean {
  return deriveIsOnline(useConnectivity.getState());
}
