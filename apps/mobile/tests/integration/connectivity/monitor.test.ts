import { act } from '@testing-library/react-native';
import { AppState } from 'react-native';
// The NetInfo mock (from tests/setup.ts) captures the latest addEventListener
// callback and exposes `__emitNetInfo(state)` to drive emissions.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { __emitNetInfo } = require('@react-native-community/netinfo') as {
  __emitNetInfo: (s: { isConnected?: boolean; isInternetReachable?: boolean }) => void;
};
import {
  startConnectivityMonitor,
  stopConnectivityMonitor,
} from '@/state/connectivityMonitor';
import { useConnectivity } from '@/state/connectivityStore';
import { useToasts } from '@/state/toastStore';

// Harness notes (this repo's RNTL 14 + React 19 setup):
//  - Fake timers are scoped per test in try/finally so a leftover debounce
//    timer can't corrupt the next test.
//  - Store mutations + timer advances are wrapped in `await act(async () => …)`
//    so the zustand subscription + any pending microtasks flush under React's
//    control before the synchronous assertion.
//  - `now` and `getServerUrl` are injected so the test is deterministic and
//    never touches Date.now() or the real auth secure-store.

const SERVER = 'https://example.test';

function freshStore() {
  // Seed serverReachable: true (not null) so a successful reconnect health-ping
  // is a no-op change to the derived online value — `deriveIsOnline` depends only
  // on `deviceOnline` for these tests, exactly as the transition logic intends.
  // Otherwise the ping's async noteServerReachable(true) lands at an uncontrolled
  // point relative to the debounce timer and can leak a toast under the slower
  // full-suite run (the flake this file fixes).
  useConnectivity.setState({ deviceOnline: true, serverReachable: true, lastPingAt: 0 });
}

let appStateCb: ((s: string) => void) | null = null;

beforeEach(() => {
  appStateCb = null;
  // Capture the AppState 'change' listener so tests can drive foreground events.
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, cb) => {
    appStateCb = cb as (s: string) => void;
    return { remove: jest.fn() } as never;
  });
  // Mock fetch for the whole file so the reconnect health-ping resolves
  // predictably and synchronously-flushable. Tests that need a different
  // outcome (reject / 503) re-mock it locally. Resolving 200 (reachable) keeps
  // serverReachable true, so the ping is a no-op change to deriveIsOnline.
  jest.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
  useToasts.setState({ toasts: [] });
  freshStore();
});

afterEach(() => {
  stopConnectivityMonitor();
  jest.restoreAllMocks();
});

it('NetInfo offline emission sets deviceOnline=false', async () => {
  jest.useFakeTimers();
  try {
    startConnectivityMonitor({ now: () => 1_000_000, getServerUrl: () => SERVER });
    await act(async () => {
      __emitNetInfo({ isConnected: false, isInternetReachable: false });
    });
    expect(useConnectivity.getState().deviceOnline).toBe(false);
  } finally {
    jest.useRealTimers();
  }
});

it('online→offline toasts "You\'re offline" after the debounce; offline→online toasts "Back online"', async () => {
  jest.useFakeTimers();
  try {
    // Start while online; the initial value must be suppressed (no toast yet).
    startConnectivityMonitor({ now: () => 1_000_000, getServerUrl: () => SERVER });
    await act(async () => {
      __emitNetInfo({ isConnected: true, isInternetReachable: true });
      // Flush the reconnect health-ping's microtasks so its noteServerReachable
      // settles BEFORE the debounce window, then advance past the debounce.
      await Promise.resolve();
      jest.advanceTimersByTime(1500);
    });
    expect(useToasts.getState().toasts).toHaveLength(0);

    // online → offline
    await act(async () => {
      __emitNetInfo({ isConnected: false, isInternetReachable: false });
      await Promise.resolve();
      jest.advanceTimersByTime(1500);
    });
    const afterOffline = useToasts.getState().toasts;
    expect(afterOffline.at(-1)?.message.startsWith("You're offline")).toBe(true);

    // offline → online
    await act(async () => {
      __emitNetInfo({ isConnected: true, isInternetReachable: true });
      await Promise.resolve();
      jest.advanceTimersByTime(1500);
    });
    expect(useToasts.getState().toasts.at(-1)?.message).toBe('Back online');
  } finally {
    jest.useRealTimers();
  }
});

it('a transition that reverts within the debounce window fires no toast', async () => {
  jest.useFakeTimers();
  try {
    startConnectivityMonitor({ now: () => 1_000_000, getServerUrl: () => SERVER });
    await act(async () => {
      __emitNetInfo({ isConnected: true, isInternetReachable: true });
      await Promise.resolve();
      jest.advanceTimersByTime(1500);
    });
    expect(useToasts.getState().toasts).toHaveLength(0);

    // Go offline then back online before the ~1s debounce elapses — net no
    // stable change, so nothing should toast.
    await act(async () => {
      __emitNetInfo({ isConnected: false, isInternetReachable: false });
      jest.advanceTimersByTime(300);
      __emitNetInfo({ isConnected: true, isInternetReachable: true });
      // Flush the reconnect ping's microtasks so its store update (a no-op
      // change since serverReachable stays true) lands BEFORE we advance past
      // the debounce and assert — it cannot race in after the assertion.
      await Promise.resolve();
      jest.advanceTimersByTime(1500);
    });
    expect(useToasts.getState().toasts).toHaveLength(0);
  } finally {
    jest.useRealTimers();
  }
});

it('reconnect fires a health-ping to /api/health and stamps lastPingAt; a second reconnect <75s does NOT re-ping', async () => {
  jest.useFakeTimers();
  const fetchMock = jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(new Response(null, { status: 200 }));
  let clock = 1_000_000;
  try {
    startConnectivityMonitor({ now: () => clock, getServerUrl: () => SERVER });
    // Start offline so the next connect counts as a transition INTO connected.
    await act(async () => {
      __emitNetInfo({ isConnected: false, isInternetReachable: false });
      jest.advanceTimersByTime(1500);
    });

    await act(async () => {
      __emitNetInfo({ isConnected: true, isInternetReachable: true });
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0]).endsWith('/api/health')).toBe(true);
    expect(useConnectivity.getState().lastPingAt).toBe(1_000_000);

    // A second reconnect 10s later — within the 75s throttle — must NOT ping.
    clock = 1_010_000;
    await act(async () => {
      __emitNetInfo({ isConnected: false, isInternetReachable: false });
      jest.advanceTimersByTime(1500);
      __emitNetInfo({ isConnected: true, isInternetReachable: true });
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});

it('health-ping resolving any Response → serverReachable true', async () => {
  jest.useFakeTimers();
  jest.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 503 }));
  try {
    startConnectivityMonitor({ now: () => 2_000_000, getServerUrl: () => SERVER });
    await act(async () => {
      __emitNetInfo({ isConnected: false, isInternetReachable: false });
      jest.advanceTimersByTime(1500);
    });
    await act(async () => {
      __emitNetInfo({ isConnected: true, isInternetReachable: true });
      await Promise.resolve();
    });
    expect(useConnectivity.getState().serverReachable).toBe(true);
  } finally {
    jest.useRealTimers();
  }
});

it('health-ping rejecting/aborting → serverReachable false', async () => {
  jest.useFakeTimers();
  jest.spyOn(global, 'fetch').mockRejectedValue(new Error('timeout'));
  try {
    startConnectivityMonitor({ now: () => 3_000_000, getServerUrl: () => SERVER });
    await act(async () => {
      __emitNetInfo({ isConnected: false, isInternetReachable: false });
      jest.advanceTimersByTime(1500);
    });
    await act(async () => {
      __emitNetInfo({ isConnected: true, isInternetReachable: true });
      await Promise.resolve();
    });
    expect(useConnectivity.getState().serverReachable).toBe(false);
  } finally {
    jest.useRealTimers();
  }
});

it('foregrounding (AppState→active) triggers a throttled ping', async () => {
  jest.useFakeTimers();
  const fetchMock = jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(new Response(null, { status: 200 }));
  try {
    startConnectivityMonitor({ now: () => 5_000_000, getServerUrl: () => SERVER });
    await act(async () => {
      appStateCb?.('active');
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0]).endsWith('/api/health')).toBe(true);
  } finally {
    jest.useRealTimers();
  }
});

it('starting the monitor while already online does not fire a "Back online" toast', async () => {
  jest.useFakeTimers();
  try {
    useConnectivity.setState({ deviceOnline: true, serverReachable: true, lastPingAt: 0 });
    startConnectivityMonitor({ now: () => 6_000_000, getServerUrl: () => SERVER });
    await act(async () => {
      __emitNetInfo({ isConnected: true, isInternetReachable: true });
      jest.advanceTimersByTime(1500);
    });
    expect(useToasts.getState().toasts).toHaveLength(0);
  } finally {
    jest.useRealTimers();
  }
});

it('no serverUrl → ping is skipped (no fetch)', async () => {
  jest.useFakeTimers();
  const fetchMock = jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(new Response(null, { status: 200 }));
  try {
    startConnectivityMonitor({ now: () => 7_000_000, getServerUrl: () => null });
    await act(async () => {
      __emitNetInfo({ isConnected: false, isInternetReachable: false });
      jest.advanceTimersByTime(1500);
      __emitNetInfo({ isConnected: true, isInternetReachable: true });
      await Promise.resolve();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});
