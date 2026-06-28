// Bare React Native babel config (post-M6 Expo eject). The `metro-react-native-babel-preset`
// was replaced by `@react-native/babel-preset` in RN 0.73+. react-native-reanimated's
// plugin must remain LAST (in RN-reanimated 4.x it re-exports react-native-worklets/plugin).
//
// `babel-plugin-transform-inline-environment-variables` replaces the Expo CLI behaviour of
// inlining `process.env.EXPO_PUBLIC_*` references at bundle time. The Maestro E2E suite
// depends on these vars being baked at Metro start; whitelist only the ones we read.
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        root: ['./'],
        alias: {
          '@': './src',
        },
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
      },
    ],
    // zod@4 and other deps emit `export * as X from`; the RN preset doesn't enable
    // this stage-4 syntax transform out of the box.
    '@babel/plugin-transform-export-namespace-from',
    [
      'transform-inline-environment-variables',
      {
        include: [
          // Short git SHA baked into the bundle so dev / TestFlight / Play builds
          // show which commit they came from. Set by the CI build jobs
          // (EXPO_PUBLIC_GIT_SHA=$CI_COMMIT_SHORT_SHA) and by the local dev scripts.
          // Without this whitelist entry babel never inlines it (this is a bare-RN
          // eject — there is no babel-preset-expo auto-inlining), so the app falls
          // back to "(dev)" even when the env var IS set at build time.
          'EXPO_PUBLIC_GIT_SHA',
          'EXPO_PUBLIC_MOBILE_E2E',
          'EXPO_PUBLIC_MOBILE_E2E_AUTOAUTH',
          'EXPO_PUBLIC_MOBILE_E2E_AUTH_MODE',
          'EXPO_PUBLIC_MOBILE_E2E_UPDATE_AVAILABLE',
          'EXPO_PUBLIC_MOBILE_E2E_FORCE_CHANGELOG',
          'EXPO_PUBLIC_MOBILE_E2E_FORCE_TABLET',
          'EXPO_PUBLIC_MOBILE_E2E_SSL_FAIL',
          'EXPO_PUBLIC_MOBILE_E2E_PUSH_ENABLED',
          'EXPO_PUBLIC_MOBILE_E2E_PUSH_AUTOGRANT',
          'EXPO_PUBLIC_MOBILE_E2E_PUSH_FIRE',
        ],
      },
    ],
    'react-native-reanimated/plugin',
  ],
};
