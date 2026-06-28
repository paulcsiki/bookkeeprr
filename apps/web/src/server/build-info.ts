import pkg from '../../package.json';

export type BuildInfo = {
  version: string;
  commit: string;
  builtAt: string;
  channel: 'stable' | 'beta' | 'nightly';
  runtime: string;
  uptime: number;
};

const STARTED_AT = Date.now();

/** Major version from a package.json dependency range (e.g. "^16.2.7" → "16"). */
function majorOf(range: string | undefined): string {
  const m = range?.match(/(\d+)/);
  return m ? m[1]! : '?';
}

const deps: Record<string, string> = {
  ...(pkg as { dependencies?: Record<string, string> }).dependencies,
};
const nextMajor = majorOf(deps.next);
const reactMajor = majorOf(deps.react);

const STATIC_BUILD_INFO = {
  version: pkg.version,
  commit: process.env.BOOKKEEPRR_COMMIT ?? 'dev',
  builtAt: process.env.BOOKKEEPRR_BUILT_AT ?? 'local',
  channel: 'stable' as const,
  // Derived from package.json so it tracks dependency bumps automatically
  // (previously hardcoded "Next 15", which went stale after the Next 16 bump).
  runtime: `Node ${process.versions.node} · Next ${nextMajor} · React ${reactMajor}`,
};

/**
 * Returns a fresh BuildInfo on every call. The `uptime` field is computed at
 * call time from `process.uptime()` so it reflects actual server uptime.
 */
export function getBuildInfo(): BuildInfo {
  return {
    ...STATIC_BUILD_INFO,
    uptime: Math.floor((Date.now() - STARTED_AT) / 1000),
  };
}

/**
 * Static snapshot captured at module load. `uptime` is 0 here since this is
 * evaluated once at import time. Prefer `getBuildInfo()` for live consumers.
 * Kept for backward compatibility.
 */
export const BUILD_INFO: BuildInfo = {
  ...STATIC_BUILD_INFO,
  uptime: 0,
};
