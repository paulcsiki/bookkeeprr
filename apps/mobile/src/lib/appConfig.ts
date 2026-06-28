// Bundled compile-time app constants. Pre-eject these came from
// expo-constants reading app.config.ts at runtime; post-eject they're
// plain TS source-of-truth. Per-release bumps edit this file (and the
// native version fields in android/app/build.gradle + Info.plist) —
// see docs/operator-todo.md for the release ritual.

// Bare semver — the update/changelog checks compare this against the server's
// reported version, so it MUST stay a plain x.y.z (no suffix).
const version = '1.0.0';

// Short commit hash of the build, injected at bundle time via EXPO_PUBLIC_GIT_SHA.
// This is a bare-RN eject (no babel-preset-expo), so the var is inlined by the
// explicit `transform-inline-environment-variables` whitelist in babel.config.js —
// EXPO_PUBLIC_GIT_SHA MUST be listed there or this stays undefined. CI sets it to
// $CI_COMMIT_SHORT_SHA; the local dev scripts (start/ios/android) set it from
// `git rev-parse --short HEAD`. Falls back to 'dev' only when truly unset. Lets a
// tester read the exact commit a build came from — diagnostic, never compared.
const gitSha = process.env.EXPO_PUBLIC_GIT_SHA ?? 'dev';

export const AppConfig = {
  version,
  gitSha,
  /** Display-only, e.g. "0.6.0 (a1b2c3d)". Never use for version comparison. */
  versionLabel: `${version} (${gitSha})`,
  name: 'Bookkeeprr',
  bundleId: 'com.bookkeeprr.app',
  scheme: 'bookkeeprr',
} as const;
