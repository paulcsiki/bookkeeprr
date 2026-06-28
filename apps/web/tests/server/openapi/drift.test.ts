import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { registry } from '@/server/openapi/registry';
import { listRouteOps } from './route-inventory';
import { UNDOCUMENTED } from './undocumented';

const API_DIR = join(__dirname, '../../../src/app/api');

const key = (p: string, m: string): string => `${m.toUpperCase()} ${p}`;

export function matchesGlob(globPath: string, path: string): boolean {
  const base = globPath.slice(0, -3); // strip '/**'
  return path === base || path.startsWith(`${base}/`);
}

function allowlisted(path: string): boolean {
  return UNDOCUMENTED.some((e) =>
    e.path.endsWith('/**') ? matchesGlob(e.path, path) : e.path === path,
  );
}

describe('OpenAPI drift guard', () => {
  const actual = listRouteOps(API_DIR);
  const actualKeys = new Set(actual.map((o) => key(o.path, o.method)));
  const registryKeys = new Set(registry.map((o) => key(o.path, o.method)));

  it('found a plausible number of routes', () => {
    expect(actual.length).toBeGreaterThan(100);
  });

  it('every registry entry maps to a real route file + method', () => {
    const ghosts = [...registryKeys].filter((k) => !actualKeys.has(k));
    expect(ghosts, `registry entries without a route:\n${ghosts.join('\n')}`).toEqual([]);
  });

  it('every route is either registered or explicitly allowlisted', () => {
    const orphans = actual
      .filter((o) => !registryKeys.has(key(o.path, o.method)) && !allowlisted(o.path))
      .map((o) => key(o.path, o.method));
    expect(
      orphans,
      `routes neither documented nor allowlisted — add to the registry or to undocumented.ts:\n${orphans.join('\n')}`,
    ).toEqual([]);
  });

  it('no stale allowlist entries', () => {
    const stale = UNDOCUMENTED.filter((e) =>
      e.path.endsWith('/**')
        ? !actual.some((o) => matchesGlob(e.path, o.path))
        : !actual.some((o) => o.path === e.path),
    ).map((e) => e.path);
    expect(stale, `allowlist entries matching no route:\n${stale.join('\n')}`).toEqual([]);
  });

  it('nothing is both registered and allowlisted', () => {
    const both = registry.filter((o) => allowlisted(o.path)).map((o) => key(o.path, o.method));
    expect(both).toEqual([]);
  });

  it('prefix globs do not swallow sibling namespaces', () => {
    // /api/series/** must not match /api/series-foo
    expect(
      UNDOCUMENTED.filter((e) => e.path.endsWith('/**')).some((e) =>
        matchesGlob(e.path, `${e.path.slice(0, -3)}-sibling`),
      ),
    ).toBe(false);
  });
});
