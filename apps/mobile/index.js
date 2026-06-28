import { AppRegistry, LogBox } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import App from './App';

// react-native-track-player@4.1.2 isn't TurboModule-compatible: its
// async methods return non-void Bundles, and the New Architecture
// rejects them at HostObject::get time, throwing
// [runtime not ready]: Error: Exception in HostObject::get for prop
// 'TrackPlayerModule' the moment any code touches the module. RN 0.82+
// forces newArchEnabled=true so we can't opt out at the gradle level.
//
// We wrap the import + registerPlaybackService in a try/catch so the
// app boots even when track-player can't load — audio playback won't
// work but everything else (library, reader for non-audio types,
// onboarding, e2e flows) will. E2E intentionally skips the call to
// keep the bundle deterministic; the redbox surfaces in dev builds
// only when the module is actually touched.
if (process.env.EXPO_PUBLIC_MOBILE_E2E !== '1') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const TrackPlayer = require('react-native-track-player').default;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PlaybackService } = require('./src/features/reader/lib/track-player-setup');
    TrackPlayer.registerPlaybackService(() => PlaybackService);
  } catch (err) {
    console.warn('[track-player] disabled at boot:', err?.message ?? err);
  }
}

// `@react-native-firebase/messaging@24.x` emits a deprecation warning on every
// call to the namespaced API (`messaging().*`) urging callers to migrate to
// the modular SDK (`getApp().messaging()`). Migration is tracked in M8; until
// then, silence the LogBox bubble so it doesn't obscure UI under Maestro e2e
// flows (the toast covered the welcome screen's "Get started" button).
LogBox.ignoreLogs([
  /This method is deprecated \(as well as all React Native Firebase namespaced API\)/,
]);

// Under Maestro e2e, suppress the LogBox warning toast entirely. New warnings
// surface frequently (RN/Reanimated/track-player upgrades, dependency churn)
// and the yellow "Open debugger to view warnings" pill covers the bottom
// portion of the screen — job 1133 had it overlay Features.tsx's Continue
// button, defeating both id-based and coordinate-based Maestro taps.
if (process.env.EXPO_PUBLIC_MOBILE_E2E === '1') {
  LogBox.ignoreAllLogs(true);
}

// rn-firebase requires `setBackgroundMessageHandler` to be registered at the
// JS entry point — BEFORE `AppRegistry.registerComponent` — so the native
// headless task can pick it up when a data-only push wakes the app. The OS
// renders any payload with a `notification` block automatically; this handler
// is a no-op placeholder reserved for future data-only side effects.
messaging().setBackgroundMessageHandler(async () => undefined);

// Native MainActivity (and iOS AppDelegate) expects the component to be
// registered under the literal name "main", which matches Expo's prebuild
// templates (`getMainComponentName(): String = "main"`).
AppRegistry.registerComponent('main', () => App);
