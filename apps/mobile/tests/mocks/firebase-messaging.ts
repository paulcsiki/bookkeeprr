// Centralized Jest mock for `@react-native-firebase/messaging`.
//
// `tests/setup.ts` wires this module in via `jest.mock(...)` so every test
// suite receives the same controllable surface area. Tests that need to drive
// the mock (e.g. flip permission status, emit a foreground message) import the
// `__*` helpers from this file directly.
//
// The default export mimics the real `messaging()` factory: each call returns
// a fresh object whose methods are `jest.fn()`s reading from a single module-
// level `state` object. Tests reset that state via `__resetFirebaseMessaging`
// in `beforeEach`.

type Listener = (msg: {
  notification?: { title?: string; body?: string };
  data?: Record<string, string>;
}) => void;

type BackgroundHandler = (msg: unknown) => Promise<void>;

type PermissionStatus = 'NOT_DETERMINED' | 'AUTHORIZED' | 'DENIED';

const state = {
  permissionStatus: 'NOT_DETERMINED' as PermissionStatus,
  token: 'mock-fcm-token',
  onMessageListeners: [] as Listener[],
  backgroundHandler: null as BackgroundHandler | null,
  onNotificationOpenedListeners: [] as Listener[],
  initialNotification: null as unknown,
};

export function __resetFirebaseMessaging(): void {
  state.permissionStatus = 'NOT_DETERMINED';
  state.token = 'mock-fcm-token';
  state.onMessageListeners = [];
  state.backgroundHandler = null;
  state.onNotificationOpenedListeners = [];
  state.initialNotification = null;
}

export function __setPermissionStatus(s: PermissionStatus): void {
  state.permissionStatus = s;
}

export function __setToken(t: string): void {
  state.token = t;
}

export function __emitForegroundMessage(msg: Parameters<Listener>[0]): void {
  state.onMessageListeners.forEach((l) => l(msg));
}

export function __emitNotificationOpened(msg: Parameters<Listener>[0]): void {
  state.onNotificationOpenedListeners.forEach((l) => l(msg));
}

export function __getBackgroundHandler(): BackgroundHandler | null {
  return state.backgroundHandler;
}

export function __setInitialNotification(msg: unknown): void {
  state.initialNotification = msg;
}

const AuthorizationStatus = {
  NOT_DETERMINED: -1,
  DENIED: 0,
  AUTHORIZED: 1,
  PROVISIONAL: 2,
  EPHEMERAL: 3,
} as const;

function messagingMock() {
  return {
    requestPermission: jest.fn(async () => {
      if (state.permissionStatus === 'NOT_DETERMINED') state.permissionStatus = 'AUTHORIZED';
      return state.permissionStatus === 'AUTHORIZED'
        ? AuthorizationStatus.AUTHORIZED
        : AuthorizationStatus.DENIED;
    }),
    hasPermission: jest.fn(async () =>
      state.permissionStatus === 'AUTHORIZED'
        ? AuthorizationStatus.AUTHORIZED
        : AuthorizationStatus.DENIED,
    ),
    getToken: jest.fn(async () => state.token),
    deleteToken: jest.fn(async () => undefined),
    onMessage: jest.fn((l: Listener) => {
      state.onMessageListeners.push(l);
      return () => {
        state.onMessageListeners = state.onMessageListeners.filter((x) => x !== l);
      };
    }),
    setBackgroundMessageHandler: jest.fn((h: BackgroundHandler) => {
      state.backgroundHandler = h;
    }),
    onNotificationOpenedApp: jest.fn((l: Listener) => {
      state.onNotificationOpenedListeners.push(l);
      return () => {
        state.onNotificationOpenedListeners = state.onNotificationOpenedListeners.filter(
          (x) => x !== l,
        );
      };
    }),
    getInitialNotification: jest.fn(async () => state.initialNotification),
    AuthorizationStatus,
  };
}

// Attach the enum to the function itself so consumers can read
// `messaging.AuthorizationStatus.AUTHORIZED` without invoking the factory.
(
  messagingMock as unknown as { AuthorizationStatus: typeof AuthorizationStatus }
).AuthorizationStatus = AuthorizationStatus;

export default messagingMock;
