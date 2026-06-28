# Changelog

## 1.0.0 - 2026-06-28 - Initial public release

- Initial public release.

## 0.6.0 - 2026-05-26 - Push notifications

- @react-native-firebase/messaging wired into the bare-RN app
- Settings → Push notifications screen with 3 states (cloud disabled / off / on)
- Foreground in-app banner with auto-dismiss + tap-to-deep-link routing
- Background message handler + notification-tap deep-link routing for cold launches
- 4 new Maestro e2e flows; 32/32 flows green
- Brand logo geometry now mirrors the bookkeeprr design system (long/longest/short bars with rounded corners)
- Requires google-services.json (Android) and GoogleService-Info.plist (iOS) - see docs/operator-todo.md
