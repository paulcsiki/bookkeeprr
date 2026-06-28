import { describe, it, expect } from 'vitest';
import { extractProxyIp, extractClientIp } from '@/server/auth/forward-auth/peer';

function mkReq(headers: Record<string, string>): Request {
  return new Request('http://localhost/', { headers });
}

describe('extractProxyIp', () => {
  it('returns the rightmost X-Forwarded-For entry', () => {
    expect(extractProxyIp(mkReq({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8, 10.0.0.1' }))).toBe(
      '10.0.0.1',
    );
  });

  it('returns the only entry when only one is present', () => {
    expect(extractProxyIp(mkReq({ 'x-forwarded-for': '10.0.0.1' }))).toBe('10.0.0.1');
  });

  it('returns null when X-Forwarded-For is absent', () => {
    expect(extractProxyIp(mkReq({}))).toBe(null);
  });

  it('returns null for empty header value', () => {
    expect(extractProxyIp(mkReq({ 'x-forwarded-for': '' }))).toBe(null);
  });

  it('trims whitespace around entries', () => {
    expect(extractProxyIp(mkReq({ 'x-forwarded-for': '1.2.3.4 , 10.0.0.1  ' }))).toBe('10.0.0.1');
  });

  it('skips empty entries from trailing commas', () => {
    expect(extractProxyIp(mkReq({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1, ,' }))).toBe('10.0.0.1');
  });
});

describe('extractClientIp', () => {
  it('returns the leftmost X-Forwarded-For entry', () => {
    expect(extractClientIp(mkReq({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8, 10.0.0.1' }))).toBe(
      '1.2.3.4',
    );
  });

  it('returns null when header absent', () => {
    expect(extractClientIp(mkReq({}))).toBe(null);
  });
});
