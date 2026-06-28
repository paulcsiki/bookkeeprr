// Bare React Native Metro config with pnpm-workspace support.
const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const workspaceRoot = path.resolve(__dirname, '../..');
const appRoot = __dirname;

/**
 * pnpm-workspace tweaks:
 * 1. enableSymlinks: pnpm's hoisted store uses symlinks; Metro defaults to no.
 * 2. watchFolders: include workspace root so changes to packages/* trigger rebuilds.
 * 3. nodeModulesPaths: tell Metro to look in both app and workspace-root
 *    node_modules so it finds workspace package symlinks.
 */
const config = {
  watchFolders: [workspaceRoot],
  resolver: {
    unstable_enableSymlinks: true,
    nodeModulesPaths: [
      path.resolve(appRoot, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
