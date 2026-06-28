import { describe, expect, it } from 'vitest';
import { compareSemver, parseSemver } from '@/server/util/semver';

describe('parseSemver', () => {
  it('parses bare semver', () => {
    expect(parseSemver('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
  });
  it('parses v-prefixed semver', () => {
    expect(parseSemver('v1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
  });
  it('returns null for non-semver', () => {
    expect(parseSemver('main')).toBeNull();
    expect(parseSemver('latest')).toBeNull();
    expect(parseSemver('v1.2')).toBeNull();
    expect(parseSemver('v1.2.3.4')).toBeNull();
  });
  it('ignores pre-release suffix (treats as same as base)', () => {
    expect(parseSemver('v1.2.3-rc.1')).toEqual({ major: 1, minor: 2, patch: 3 });
  });
});

describe('compareSemver', () => {
  it('returns 1 when a > b on major', () => {
    expect(compareSemver('v2.0.0', 'v1.99.99')).toBe(1);
  });
  it('returns -1 when a < b on minor', () => {
    expect(compareSemver('v1.2.0', 'v1.3.0')).toBe(-1);
  });
  it('returns 0 when equal', () => {
    expect(compareSemver('v1.2.3', '1.2.3')).toBe(0);
  });
  it('returns 1 when a > b on patch', () => {
    expect(compareSemver('v1.2.4', 'v1.2.3')).toBe(1);
  });
  it('returns 0 when either side is unparseable', () => {
    expect(compareSemver('main', 'v1.0.0')).toBe(0);
    expect(compareSemver('v1.0.0', 'latest')).toBe(0);
  });
});
