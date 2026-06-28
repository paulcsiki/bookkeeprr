import 'react-native-gesture-handler'; // must be first
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppState, StatusBar } from 'react-native';
import { useEffect } from 'react';
import BootSplash from 'react-native-bootsplash';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { refreshProfile } from '@/state/refreshProfile';
import { profileSnapshot, shouldRefreshProfile } from '@/state/profileStore';
import { VersionGate } from '@/features/updates/VersionGate';
import { RootNavigator } from '@/navigation/RootNavigator';
import { bootstrapE2E } from '@/lib/e2e-bootstrap';
import { useNotificationTapHandler } from '@/push/useNotificationTapHandler';
import {
  downloadsHydrated,
  reconcileDownloadsWithDisk,
  expireOldDownloads,
  resumeInterruptedDownloads,
  pauseInFlightForBackground,
  shouldCancelInFlightOnAppState,
} from '@/state/readerDownloadsStore';
import { startConnectivityMonitor, stopConnectivityMonitor } from '@/state/connectivityMonitor';
import { wireOnlineManager } from '@/state/onlineManagerBridge';
import { useConnectivity, isOnlineNow } from '@/state/connectivityStore';
import { ToastHost } from '@/components/ToastHost';

bootstrapE2E().catch(() => {
  /* MSW only matters in e2e */
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnReconnect: true } },
});

/**
 * Refreshes the cached profile (identity + avatar-to-disk) post-login and on
 * app-foreground so the Home greeting shows the real name + avatar — offline-safe
 * because the cache is what paints. Throttled via `shouldRefreshProfile` (mirrors
 * the connectivity ping throttle) and skipped offline inside `refreshProfile`
 * (`isOnlineNow()`). Must live INSIDE <AuthProvider> so it can read the creds via
 * `useAuth`. Renders nothing.
 */
function ProfileRefresher() {
  const { state } = useAuth();
  const creds = state.status === 'authenticated' ? state.creds : null;
  useEffect(() => {
    if (creds === null) return;
    const maybeRefresh = () => {
      if (shouldRefreshProfile(profileSnapshot(), Date.now())) void refreshProfile(creds);
    };
    // Initial refresh when auth becomes authenticated (post-login / restored session).
    maybeRefresh();
    // And again whenever the app returns to the foreground.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') maybeRefresh();
    });
    return () => sub.remove();
  }, [creds]);
  return null;
}

/**
 * Resumes any offline download left interrupted by a background/suspend/drop.
 *
 * A download is in-memory JS orchestration — backgrounding the app mid-transfer
 * suspends the native fetch and leaves the entry at `queued`/`downloading`/
 * `paused` with nothing to finish it. We resume on THREE triggers: mount (after
 * hydration, i.e. cold start), every foreground (`AppState 'active'`), and an
 * offline→online transition. Each file RESUMES from its on-disk byte offset via
 * `resumableFetchFile` (HTTP Range) — it does not re-download from scratch. The
 * in-flight guard in the store prevents double-starting one already running.
 *
 * On the way OUT (`AppState 'background'`/`'inactive'`) we proactively cancel any
 * RUNNING transfer via `pauseInFlightForBackground()`. Without this, iOS suspends
 * the still-`inFlight` native transfer and restarts it from byte 0 on foreground
 * (and `resumeInterruptedDownloads` skips it precisely because it's in-flight) —
 * so a download at 20% would start over. Cancelling leaves the partial on disk
 * and marks the entry `paused`, so the foreground trigger Range-resumes it.
 *
 * Best-effort + online-only is handled inside `resumeInterruptedDownloads` /
 * `downloadReadable`. Must live INSIDE <AuthProvider> to read the creds. Renders
 * nothing.
 */
function DownloadResumer() {
  const { state } = useAuth();
  const creds = state.status === 'authenticated' ? state.creds : null;
  useEffect(() => {
    if (creds === null) return;
    const resume = () => {
      void downloadsHydrated.then(() =>
        resumeInterruptedDownloads({ serverUrl: creds.serverUrl, token: creds.token }),
      );
    };
    // Resume once auth is available (post-login / restored session)…
    resume();
    // …and again whenever the app returns to the foreground (where a suspended
    // native fetch would otherwise leave a download stuck forever).
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') resume();
      // Leaving the foreground: cancel any RUNNING transfer + mark it paused so
      // iOS can't silently restart it from 0 — EXCEPT on iOS, where the download
      // uses a background NSURLSession that the OS carries across suspension, so
      // it must be left running (see shouldCancelInFlightOnAppState).
      else if (shouldCancelInFlightOnAppState(s)) pauseInFlightForBackground();
    });
    // Resume on an offline→online TRANSITION so a network-regained event
    // automatically un-sticks any paused download without waiting for the next
    // foreground. We track `wasOnline` to detect a false→true flip and guard
    // against firing on the initial subscribe (which is not a transition) or on
    // every store change while already online.
    let wasOnline = isOnlineNow();
    const unsub = useConnectivity.subscribe(() => {
      const online = isOnlineNow();
      if (online && !wasOnline) {
        void downloadsHydrated.then(() =>
          resumeInterruptedDownloads({ serverUrl: creds.serverUrl, token: creds.token }),
        );
      }
      wasOnline = online;
    });
    return () => {
      sub.remove();
      unsub();
    };
  }, [creds]);
  return null;
}

export default function App() {
  useNotificationTapHandler();

  useEffect(() => {
    BootSplash.hide({ fade: true }).catch(() => {});
    // Once the persisted map is restored: heal entries whose files are gone (so
    // the OFFLINE badge matches the Downloads manager), then expire offline
    // content older than the 30-day TTL.
    void downloadsHydrated.then(async () => {
      await reconcileDownloadsWithDisk();
      await expireOldDownloads();
    });
    // Re-run the expiry sweep whenever the app returns to the foreground.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void expireOldDownloads();
    });
    // Bring up connectivity tracking: the monitor (NetInfo/AppState/server-ping →
    // store) and the bridge mirroring the store's online value into TanStack
    // Query's onlineManager. `startConnectivityMonitor` is idempotent (tears down
    // any prior run), so StrictMode's double-invoke is safe.
    startConnectivityMonitor();
    const unwireOnline = wireOnlineManager();
    return () => {
      sub.remove();
      stopConnectivityMonitor();
      unwireOnline();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* SafeAreaProvider must sit at the app root: ToastHost is mounted here
          (above RootNavigator) and calls useSafeAreaInsets() (offsets by
          insets.top), so without a provider at this level the app crashes on
          launch on-device ("No safe area value available"). Tests mock
          safe-area-context, which is why this only surfaced in the device e2e,
          not the Jest suite. */}
      <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            {/* The app surface is always dark; iOS would otherwise render
                dark-content on a dark background when the device is in light
                mode, leaving the clock/icons invisible. */}
            <StatusBar barStyle="light-content" />
            {/* Side-effect-only: refreshes the cached profile post-login/foreground. */}
            <ProfileRefresher />
            {/* Side-effect-only: restarts interrupted offline downloads on foreground. */}
            <DownloadResumer />
            <VersionGate>
              <RootNavigator />
            </VersionGate>
            {/* Absolutely-positioned overlay; floats above all tabs. */}
            <ToastHost />
          </QueryClientProvider>
        </AuthProvider>
      </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
