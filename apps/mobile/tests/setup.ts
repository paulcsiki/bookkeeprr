// @testing-library/react-native v12.4+ ships the jest-native matchers built-in
// and auto-registers them on import, so the deprecated @testing-library/jest-native
// package (and its extend-expect import) is no longer needed.
import { server } from './mocks/server';
import { useConnectivity } from '@/state/connectivityStore';

// Heavy RN integration tests render full screens (react-query + MSW + SVG +
// Animated); they settle in <1s locally but the cold CI runner is ~7x slower
// and the 5s jest default also collides with RNTL's 5s waitFor default. Set it
// here (setupFilesAfterEnv runs for every project) — a project-level
// `testTimeout` in jest.config is ignored by Jest when using `projects`.
jest.setTimeout(20_000);

jest.mock('@/lib/secure-storage', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

// `react-native-safe-area-context` requires a native provider; in tests we
// return zero insets so AppBar and other safe-area-aware components render
// without crashing.
jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  const INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
  const FRAME = { x: 0, y: 0, width: 375, height: 812 };
  return {
    useSafeAreaInsets: () => INSETS,
    useSafeAreaFrame: () => FRAME,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SafeAreaProvider: ({ children }: { children: any }) =>
      React.createElement(React.Fragment, null, children),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SafeAreaConsumer: ({ children }: { children: (insets: typeof INSETS) => any }) =>
      children(INSETS),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SafeAreaView: ({ children }: { children: any }) =>
      React.createElement(React.Fragment, null, children),
    initialWindowMetrics: { insets: INSETS, frame: FRAME },
  };
});

// AsyncStorage ships an in-memory Jest mock; wire it via the official path so
// every test gets a clean-ish store backed by a Map. Suites that need a fresh
// store call `await AsyncStorage.clear()` in beforeEach.
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest'),
);

// `@shopify/flash-list` v2 ships ESM that the RN jest preset does not transform
// (it relies on the New-Architecture native layout engine, unavailable in jsdom/
// node). Mock it with a minimal component that renders every item through
// `renderItem` so list contents are assertable in tests; the real virtualization
// + paging is device-verified.
jest.mock('@shopify/flash-list', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  function FlashList({
    data,
    renderItem,
    keyExtractor,
    testID,
    onViewableItemsChanged,
    extraData,
  }: {
    data?: readonly unknown[];
    renderItem?: (info: { item: unknown; index: number; target: string }) => unknown;
    keyExtractor?: (item: unknown, index: number) => string;
    testID?: string;
    onViewableItemsChanged?: (info: { viewableItems: unknown[] }) => void;
    extraData?: unknown;
  }) {
    const items = (data ?? []).map((item: unknown, index: number) => {
      const key = keyExtractor ? keyExtractor(item, index) : String(index);
      return React.createElement(
        View,
        { key },
        renderItem ? renderItem({ item, index, target: 'Cell' }) : null,
      );
    });
    // Surface `onViewableItemsChanged` + `extraData` on the host element's props
    // so tests can drive viewability and assert the re-render trigger. (This mock
    // re-renders every item each render and does NOT model recycling, so the
    // `extraData` wiring — which is what makes the real FlashList re-render its
    // materialized cells when external state changes — can only be guarded here
    // by asserting the prop. The recycle behavior itself is device-verified.)
    return React.createElement(View, { testID, onViewableItemsChanged, extraData }, items);
  }
  return { __esModule: true, FlashList };
});

// `react-native-webview` ships native code that cannot run in jest. Mock the
// `WebView` to a plain View that surfaces the `source` / `injectedJavaScript` /
// `onMessage` props so tests can assert the resource URI + auth headers and
// drive `onMessage` events. Real rendering + JS injection is device-verified.
// Injected JS is normally a no-op in jest (the mock forwarded no ref). To let
// tests assert imperative navigation (e.g. the MOBI foliate `goToHref`), the
// ref now implements `injectJavaScript`, recording each call into this log.
// Suites that assert against it clear it in `beforeEach`.
(globalThis as { __webviewInjectLog?: string[] }).__webviewInjectLog = [];
jest.mock('react-native-webview', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  const WebView = React.forwardRef(function WebView(
    props: Record<string, unknown>,
    ref: unknown,
  ) {
    React.useImperativeHandle(ref, () => ({
      injectJavaScript: (js: string) => {
        (globalThis as { __webviewInjectLog?: string[] }).__webviewInjectLog?.push(js);
      },
    }));
    return React.createElement('RNCWebView', { testID: 'webview', ...props });
  });
  return { __esModule: true, WebView };
});

// `react-native-pdf` ships native code. Mock the default-exported component to a
// plain View that surfaces `source` + `onPageChanged` so tests can assert the
// pdf serving URI + auth header and drive page changes. Real rendering is
// device-verified.
jest.mock('react-native-pdf', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  function Pdf(props: Record<string, unknown>) {
    return React.createElement('RNCPdf', { testID: 'pdf-view', ...props });
  }
  return { __esModule: true, default: Pdf };
});

// `react-native-track-player` ships native code (an audio playback service)
// that cannot run in jest. Mock the default-exported player API + the hooks the
// AudioReader consumes so components render and transport calls are assertable.
// Functions resolve promises; `useProgress`/`usePlaybackState`/`useActiveTrack`
// return stable stubs. Real playback + lock-screen behaviour is device/CI-only.
// A mutable playback-state holder so suites can drive `usePlaybackState` (e.g.
// to exercise the AudioReader's play/pause sync with the native player). Default
// is `undefined` (not playing). Reset to undefined in suites that mutate it.
(globalThis as { __rntpState?: string | undefined }).__rntpState = undefined;
jest.mock('react-native-track-player', () => {
  const player = {
    setupPlayer: jest.fn(async () => undefined),
    updateOptions: jest.fn(async () => undefined),
    registerPlaybackService: jest.fn(),
    add: jest.fn(async () => undefined),
    reset: jest.fn(async () => undefined),
    play: jest.fn(async () => undefined),
    pause: jest.fn(async () => undefined),
    stop: jest.fn(async () => undefined),
    seekTo: jest.fn(async () => undefined),
    seekBy: jest.fn(async () => undefined),
    setRate: jest.fn(async () => undefined),
    skip: jest.fn(async () => undefined),
    skipToNext: jest.fn(async () => undefined),
    skipToPrevious: jest.fn(async () => undefined),
    getProgress: jest.fn(async () => ({ position: 0, duration: 0, buffered: 0 })),
    getActiveTrackIndex: jest.fn(async () => 0),
    isServiceRunning: jest.fn(async () => false),
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  };
  return {
    __esModule: true,
    default: player,
    ...player,
    useProgress: () => ({ position: 0, duration: 0, buffered: 0 }),
    usePlaybackState: () => ({
      state: (globalThis as { __rntpState?: string | undefined }).__rntpState,
    }),
    useActiveTrack: () => undefined,
    State: { None: 'none', Ready: 'ready', Playing: 'playing', Paused: 'paused' },
    Capability: {
      Play: 1,
      Pause: 3,
      Stop: 4,
      SeekTo: 5,
      JumpForward: 9,
      JumpBackward: 10,
    },
    Event: {
      RemotePlay: 'remote-play',
      RemotePause: 'remote-pause',
      RemoteSeek: 'remote-seek',
      RemoteJumpForward: 'remote-jump-forward',
      RemoteJumpBackward: 'remote-jump-backward',
    },
    AppKilledPlaybackBehavior: {
      ContinuePlayback: 'continue-playback',
      StopPlaybackAndRemoveNotification: 'stop-playback-and-remove-notification',
    },
  };
});

// Centralized mock for `@react-native-firebase/messaging`. The actual mock
// implementation (and helpers like `__resetFirebaseMessaging`) lives in
// `tests/mocks/firebase-messaging.ts` so suites can import the helpers
// directly to drive the mocked state.
jest.mock('@react-native-firebase/messaging', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./mocks/firebase-messaging');
});

// `react-native-blob-util` ships native file-I/O code that cannot run in jest.
// The controllable mock (and `__*` helpers to assert URLs/headers/paths and
// drive progress/completion) lives in `tests/mocks/blob-util.ts`; suites import
// the helpers directly. Real download + filesystem behaviour is device/CI-only.
jest.mock('react-native-blob-util', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./mocks/blob-util');
});

// NetInfo is a native module (no JS impl in jest). Default to a Wi-Fi connection
// so the Wi-Fi-only download gate doesn't block in tests; suites can override.
// `addEventListener` captures the latest callback into a module-scoped var and
// returns a no-op unsubscribe; tests drive emissions through the exported
// `__emitNetInfo(state)` handle (mirrors the FlashList prop-passthrough idiom
// for surfacing mock handles). `fetch` still resolves a connected state so the
// existing Wi-Fi-only download gate keeps working.
jest.mock('@react-native-community/netinfo', () => {
  let cb: ((state: { isConnected?: boolean; isInternetReachable?: boolean }) => void) | null =
    null;
  return {
    __esModule: true,
    default: {
      fetch: jest.fn().mockResolvedValue({ type: 'wifi', isConnected: true }),
      addEventListener: jest.fn((listener: typeof cb) => {
        cb = listener;
        return () => {
          cb = null;
        };
      }),
    },
    __emitNetInfo: (state: { isConnected?: boolean; isInternetReachable?: boolean }) => {
      cb?.(state);
    },
  };
});

// Global react-navigation mock — most tests render screens directly without
// wrapping in a NavigationContainer. The mock returns stable jest.fn()s so
// tests can override per-suite if they need to assert navigation calls.
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      navigate: jest.fn(),
      goBack: jest.fn(),
      reset: jest.fn(),
      replace: jest.fn(),
      push: jest.fn(),
      pop: jest.fn(),
      setOptions: jest.fn(),
      setParams: jest.fn(),
      getParent: jest.fn(() => ({
        navigate: jest.fn(),
        goBack: jest.fn(),
        reset: jest.fn(),
      })),
      addListener: jest.fn(() => () => undefined),
      removeListener: jest.fn(),
      isFocused: () => true,
    }),
    useRoute: () => ({ params: {}, key: 'mock-route', name: 'MockRoute' }),
    useFocusEffect: (cb: () => void | (() => void)) => {
      cb();
    },
    useNavigationState: () => undefined,
    useIsFocused: () => true,
  };
});

// `react-native-reanimated` ships a worklet runtime + a Babel plugin that the
// node jest environment can't execute. Mock the slice the reader consumes:
// `Animated.View` renders to a plain View (forwarding style), shared values are
// plain mutable holders, `useAnimatedStyle` runs its factory eagerly, and
// `runOnJS` returns the function unchanged. Real worklet/UI-thread behavior is
// device-verified.
jest.mock('react-native-reanimated', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  const AnimatedView = React.forwardRef(
    (props: Record<string, unknown>, ref: unknown) =>
      React.createElement(View, { ref, ...props }),
  );
  AnimatedView.displayName = 'Animated.View';
  return {
    __esModule: true,
    default: { View: AnimatedView },
    View: AnimatedView,
    useSharedValue: (init: unknown) => ({ value: init }),
    useAnimatedStyle: (factory: () => unknown) => factory(),
    withTiming: (v: unknown) => v,
    withSpring: (v: unknown) => v,
    withRepeat: (v: unknown) => v,
    runOnJS: (fn: (...a: unknown[]) => unknown) => fn,
    Easing: {
      inOut: (_e: unknown) => _e,
      ease: 0,
      linear: 0,
      quad: 0,
      cubic: 0,
      bezier: () => 0,
      in: (_e: unknown) => _e,
      out: (_e: unknown) => _e,
    },
  };
});

// `react-native-gesture-handler` needs its native module + a host root. Mock
// the modern `Gesture` builder + `GestureDetector` to inert pass-throughs:
// `GestureDetector` renders its children, and every gesture builder method is
// chainable and returns the gesture. The component's gesture WIRING is
// device-verified; jest only asserts it renders the active page.
jest.mock('react-native-gesture-handler', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // Legacy `Swipeable` (used by SwipeToDelete): render the row content; the
  // swipe gesture + revealed actions are device-verified. forwardRef so the
  // component's `ref` (for `.close()`) doesn't trigger a function-ref warning.
  const Swipeable = React.forwardRef(
    ({ children }: { children: unknown }, _ref: unknown) => children,
  );
  Swipeable.displayName = 'Swipeable';
  const makeGesture = () => {
    const g: Record<string, (...a: unknown[]) => unknown> = {};
    const chain = () => g;
    for (const m of [
      'onBegin',
      'onStart',
      'onUpdate',
      'onChange',
      'onEnd',
      'onFinalize',
      'enabled',
      'minPointers',
      'maxPointers',
      'activateAfterLongPress',
      'minDistance',
      'shouldCancelWhenOutside',
      'numberOfTaps',
      'maxDelay',
      'direction',
      'simultaneousWithExternalGesture',
      'requireExternalGestureToFail',
    ]) {
      g[m] = chain;
    }
    return g;
  };
  return {
    __esModule: true,
    Swipeable,
    Directions: { RIGHT: 1, LEFT: 2, UP: 4, DOWN: 8 },
    GestureDetector: ({ children }: { children: unknown }) => children,
    GestureHandlerRootView: ({ children }: { children: unknown }) => children,
    Gesture: {
      Pinch: makeGesture,
      Pan: makeGesture,
      Tap: makeGesture,
      Fling: makeGesture,
      Simultaneous: (...gs: unknown[]) => gs[0],
      Race: (...gs: unknown[]) => gs[0],
      Exclusive: (...gs: unknown[]) => gs[0],
    },
  };
});

// gesture-handler v3's `ReanimatedSwipeable` (subpath import, used by
// SwipeToDelete): render the row content; the swipe gesture + revealed actions
// are device-verified. forwardRef so the `.close()` ref doesn't warn.
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // Render the row content AND the revealed right-actions (the destructive
  // delete Pressable carries the `swipe-delete-<id>` testID + `onDelete`), so a
  // test can `fireEvent.press(getByTestId('swipe-delete-<id>'))` to exercise the
  // delete path synchronously. The swipe gesture itself is device-verified.
  const ReanimatedSwipeable = React.forwardRef(
    (
      {
        children,
        renderRightActions,
      }: { children: unknown; renderRightActions?: () => unknown },
      _ref: unknown,
    ) =>
      React.createElement(
        React.Fragment,
        null,
        children,
        renderRightActions ? renderRightActions() : null,
      ),
  );
  ReanimatedSwipeable.displayName = 'ReanimatedSwipeable';
  return { __esModule: true, default: ReanimatedSwipeable };
});

// Default to phone-size viewport for all tests so existing phone-mode
// layouts keep rendering as they did pre-M5. Tablet-specific tests
// override this via their own jest.mock at the top of the file.
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 402, height: 874 }),
}));

// Silence two known framework warnings that flood the suite without
// indicating real test bugs:
//
// 1. react-test-renderer 19's `warnIfUpdatesNotWrappedWithActDEV`
//    fires on every async state settle even when @testing-library/
//    react-native already wraps the render in `act()`. Meta has
//    deprecated react-test-renderer for React 19 and recommends RNTL
//    going forward, so this is upstream noise we can't fix here.
//
// 2. `SafeAreaView has been deprecated and will be removed in a future
//    release` — emitted by react-native core when any component still
//    imports it from `react-native`. The migration to
//    react-native-safe-area-context is tracked separately.
//
// All other console.error/warn output still surfaces unchanged.
const realConsoleError = console.error;
const realConsoleWarn = console.warn;
console.error = (...args: unknown[]) => {
  const msg = typeof args[0] === 'string' ? args[0] : '';
  if (msg.includes('not wrapped in act')) return;
  realConsoleError(...args);
};
console.warn = (...args: unknown[]) => {
  const msg = typeof args[0] === 'string' ? args[0] : '';
  if (msg.includes('SafeAreaView has been deprecated')) return;
  realConsoleWarn(...args);
};

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));

// Pin connectivity ONLINE before every test. `useConnectivity` is a
// module-global zustand store that persists across test files within a Jest
// worker, and nothing resets it — so an offline-mode suite that sets
// `serverReachable: false` (and doesn't restore it) leaves later suites
// derived offline, flipping online-flow integration tests into the new offline
// branches (e.g. SeriesOverview's offline state has no Move-to-group sheet).
// Defaulting every test online here makes that the explicit opt-out: the
// connectivity/offline suites set their own state in their own (file-level)
// `beforeEach`, which runs AFTER this one, so this does not disturb them.
beforeEach(() => {
  useConnectivity.setState({ deviceOnline: true, serverReachable: true, lastPingAt: 0 });
});

afterEach(() => server.resetHandlers());
afterAll(() => server.close());
