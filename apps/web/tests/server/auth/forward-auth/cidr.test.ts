import { describe, it, expect } from 'vitest';
import { isIpInCidrList, isCidrValid } from '@/server/auth/forward-auth/cidr';

describe('isIpInCidrList', () => {
  it('returns true for IPv4 inside the CIDR', () => {
    expect(isIpInCidrList('192.168.1.5', ['192.168.1.0/24'])).toBe(true);
    expect(isIpInCidrList('10.0.42.7', ['10.0.0.0/8'])).toBe(true);
  });

  it('returns false for IPv4 outside the CIDR', () => {
    expect(isIpInCidrList('192.168.2.5', ['192.168.1.0/24'])).toBe(false);
    expect(isIpInCidrList('172.20.0.1', ['10.0.0.0/8'])).toBe(false);
  });

  it('returns true for IPv6 inside the CIDR', () => {
    expect(isIpInCidrList('fd00::1', ['fd00::/8'])).toBe(true);
    expect(isIpInCidrList('2001:db8::42', ['2001:db8::/32'])).toBe(true);
  });

  it('returns false for IPv6 outside the CIDR', () => {
    expect(isIpInCidrList('fe80::1', ['fd00::/8'])).toBe(false);
  });

  it('normalizes IPv4-mapped IPv6 to IPv4', () => {
    expect(isIpInCidrList('::ffff:192.168.1.5', ['192.168.1.0/24'])).toBe(true);
    expect(isIpInCidrList('::ffff:10.0.0.42', ['10.0.0.0/8'])).toBe(true);
  });

  it('does not match IPv4 against IPv6 CIDR (different kind)', () => {
    expect(isIpInCidrList('192.168.1.5', ['fd00::/8'])).toBe(false);
    expect(isIpInCidrList('fd00::1', ['192.168.1.0/24'])).toBe(false);
  });

  it('returns false for malformed IP', () => {
    expect(isIpInCidrList('not-an-ip', ['192.168.1.0/24'])).toBe(false);
    expect(isIpInCidrList('', ['192.168.1.0/24'])).toBe(false);
  });

  it('silently skips malformed CIDR entries and checks the rest', () => {
    expect(isIpInCidrList('192.168.1.5', ['nonsense', '192.168.1.0/24'])).toBe(true);
    expect(isIpInCidrList('192.168.1.5', ['nonsense'])).toBe(false);
  });

  it('returns false for empty cidr list', () => {
    expect(isIpInCidrList('192.168.1.5', [])).toBe(false);
  });
});

describe('isCidrValid', () => {
  it('accepts well-formed IPv4 CIDR', () => {
    expect(isCidrValid('192.168.1.0/24')).toBe(true);
    expect(isCidrValid('10.0.0.0/8')).toBe(true);
    expect(isCidrValid('0.0.0.0/0')).toBe(true);
  });

  it('accepts well-formed IPv6 CIDR', () => {
    expect(isCidrValid('fd00::/8')).toBe(true);
    expect(isCidrValid('::/0')).toBe(true);
  });

  it('rejects malformed input', () => {
    expect(isCidrValid('192.168.1.0')).toBe(false);
    expect(isCidrValid('192.168.1.0/33')).toBe(false);
    expect(isCidrValid('nonsense')).toBe(false);
    expect(isCidrValid('')).toBe(false);
  });
});
