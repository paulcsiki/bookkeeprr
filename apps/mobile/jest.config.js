// Bare React Native jest setup (post-M6 Expo eject). Uses `react-native`'s
// own jest preset, which is the canonical preset for bare RN projects and
// delegates to @react-native/jest-preset under the hood.

// @testing-library/react-native's ensurePeerDeps() check runs at module
// load time and requires react-test-renderer to exactly match the react
// version. In the pnpm workspace react@19.2.3 is installed but
// react-test-renderer resolves to 19.2.6 (a minor drift). Setting
// RNTL_SKIP_DEPS_CHECK bypasses the strict version check; functionality
// is unaffected.
process.env.RNTL_SKIP_DEPS_CHECK = '1';
const sharedModuleNameMapper = {
  '^@/(.*)$': '<rootDir>/src/$1',
};

// MSW + its transitive ESM-only dependencies need to be transformed by Babel so
// Jest's CommonJS-only loader can consume them. The RN preset's
// `transformIgnorePatterns` only exempts React Native packages, so we extend it
// here. The two-segment pattern catches both pnpm-flattened and pnpm-nested
// locations (e.g. `node_modules/.pnpm/rettime@x/node_modules/rettime/...`).
const transformIgnorePatterns = [
  '/node_modules/(?!(\\.pnpm|react-native|@react-native|@react-native-community|react-navigation|@react-navigation|@sentry/react-native|native-base|msw|@mswjs|@bundled-es-modules|@open-draft|outvariant|strict-event-emitter|until-async|headers-polyfill|cookie|rettime))',
  '/node_modules/(?:[^/]+/)?node_modules/(?!(msw|@mswjs|@bundled-es-modules|@open-draft|outvariant|strict-event-emitter|until-async|headers-polyfill|cookie|rettime))',
  '/node_modules/react-native-reanimated/plugin/',
  '/node_modules/@react-native/babel-preset/',
];

// The RN preset only registers babel-jest for `.js/.jsx/.ts/.tsx`. MSW's
// dependency `rettime` ships `.mjs` exclusively, so add a transform entry that
// covers `.mjs` and `.cjs` too (Jest concatenates project transform with the
// preset's `transform` map; we re-use babel-jest with the same config).
const rnPreset = require('react-native/jest-preset.js');
const babelJestEntry = rnPreset.transform['^.+\\.(js|ts|tsx)$'];
const extraTransform = {
  '\\.m?[jt]sx?$': babelJestEntry,
};

const moduleFileExtensions = [
  ...(rnPreset.moduleFileExtensions ?? ['js', 'jsx', 'ts', 'tsx', 'json', 'node']),
  'mjs',
  'cjs',
];

module.exports = {
  preset: 'react-native',
  projects: [
    {
      preset: 'react-native',
      displayName: 'unit',
      testMatch: ['<rootDir>/tests/unit/**/*.test.ts?(x)'],
      moduleNameMapper: sharedModuleNameMapper,
      setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
      testEnvironment: 'node',
      transformIgnorePatterns,
      transform: extraTransform,
      moduleFileExtensions,
    },
    {
      preset: 'react-native',
      displayName: 'integration',
      testMatch: ['<rootDir>/tests/integration/**/*.test.ts?(x)'],
      moduleNameMapper: sharedModuleNameMapper,
      setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
      testEnvironment: 'node',
      transformIgnorePatterns,
      transform: extraTransform,
      moduleFileExtensions,
    },
  ],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
  coverageThreshold: {
    global: { lines: 80, branches: 75 },
  },
};
