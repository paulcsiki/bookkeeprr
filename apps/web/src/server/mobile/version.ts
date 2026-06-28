import pkg from '../../../package.json';

/**
 * Minimum mobile-app build the server will issue tokens to. Bumping this
 * forces older clients to update before they can complete onboarding.
 */
export const MIN_SUPPORTED_MOBILE_VERSION = '0.1.0';

/**
 * Current server version, read from package.json at build time. Mirrors
 * `BUILD_INFO.version` but is decoupled from build metadata so the mobile
 * handshake/version endpoints stay deterministic in tests.
 */
export function getCurrentServerVersion(): string {
  return pkg.version;
}
