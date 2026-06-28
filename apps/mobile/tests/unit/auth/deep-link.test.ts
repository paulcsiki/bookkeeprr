import { parseCallback } from '@/auth/deep-link';

describe('parseCallback', () => {
  it('extracts exchange code', () => {
    expect(parseCallback('bookkeeprr://auth/callback?exchange=abc123')).toEqual({
      ok: true,
      exchangeCode: 'abc123',
    });
  });
  it('returns error when exchange is missing', () => {
    expect(parseCallback('bookkeeprr://auth/callback')).toEqual({
      ok: false,
      error: 'missing exchange code',
    });
  });
  it('rejects wrong path', () => {
    expect(parseCallback('bookkeeprr://other?exchange=x')).toEqual({
      ok: false,
      error: 'unexpected deep-link path',
    });
  });
  it('rejects wrong scheme', () => {
    expect(parseCallback('https://x/auth/callback?exchange=x')).toEqual({
      ok: false,
      error: 'unexpected scheme',
    });
  });

  // On-device URL shapes that RN's broken `URL` mis-parsed:
  it('accepts a triple-slash authority-less form', () => {
    expect(parseCallback('bookkeeprr:///auth/callback?exchange=abc123')).toEqual({
      ok: true,
      exchangeCode: 'abc123',
    });
  });
  it('accepts a trailing slash before the query', () => {
    expect(parseCallback('bookkeeprr://auth/callback/?exchange=abc123')).toEqual({
      ok: true,
      exchangeCode: 'abc123',
    });
  });
  it('url-decodes the exchange code and stops at the next param', () => {
    expect(parseCallback('bookkeeprr://auth/callback?exchange=a%2Bb&x=1')).toEqual({
      ok: true,
      exchangeCode: 'a+b',
    });
  });
  it('rejects a deeper path that merely starts with auth/callback', () => {
    expect(parseCallback('bookkeeprr://auth/callbackish?exchange=x')).toEqual({
      ok: false,
      error: 'unexpected deep-link path',
    });
  });
  it('ignores unrelated deep links (e.g. push)', () => {
    expect(parseCallback('bookkeeprr://library/series/1').ok).toBe(false);
  });
});
