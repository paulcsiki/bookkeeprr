import { describe, expect, it } from 'vitest';
import { getBuildInfo, BUILD_INFO } from '@/server/build-info';

describe('getBuildInfo()', () => {
  it('returns uptime > 0 since the module has been loaded for at least some time', () => {
    const info = getBuildInfo();
    expect(info.uptime).toBeGreaterThanOrEqual(0);
  });

  it('successive calls return increasing or equal uptime', async () => {
    const a = getBuildInfo();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const b = getBuildInfo();
    expect(b.uptime).toBeGreaterThanOrEqual(a.uptime);
  });

  it('returns the same static fields as BUILD_INFO', () => {
    const info = getBuildInfo();
    expect(info.version).toBe(BUILD_INFO.version);
    expect(info.commit).toBe(BUILD_INFO.commit);
    expect(info.builtAt).toBe(BUILD_INFO.builtAt);
    expect(info.channel).toBe(BUILD_INFO.channel);
    expect(info.runtime).toBe(BUILD_INFO.runtime);
  });

  it('BUILD_INFO.uptime is 0 (static snapshot)', () => {
    expect(BUILD_INFO.uptime).toBe(0);
  });

  it('runtime string is derived from package.json, not hardcoded', async () => {
    // Guards against the stale "Next 15" the runtime line used to hardcode.
    const pkg = (await import('../../package.json')).default as {
      dependencies: Record<string, string>;
    };
    const nextMajor = pkg.dependencies.next!.match(/(\d+)/)![1];
    const reactMajor = pkg.dependencies.react!.match(/(\d+)/)![1];
    expect(getBuildInfo().runtime).toBe(
      `Node ${process.versions.node} · Next ${nextMajor} · React ${reactMajor}`,
    );
  });
});
