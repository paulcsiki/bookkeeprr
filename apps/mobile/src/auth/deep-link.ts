export type CallbackResult = { ok: true; exchangeCode: string } | { ok: false; error: string };

// Deliberately parsed with string/regex, NOT `new URL`. React Native's
// built-in URL is an incomplete polyfill that parses custom schemes like
// `bookkeeprr://auth/callback` inconsistently (hostname/pathname/searchParams
// come out wrong on-device), which silently broke the auth callback on iOS
// while passing under Node in jest. String parsing behaves identically
// everywhere.
export function parseCallback(url: string): CallbackResult {
  if (typeof url !== 'string' || url.length === 0) return { ok: false, error: 'malformed url' };
  if (!url.startsWith('bookkeeprr://')) return { ok: false, error: 'unexpected scheme' };
  // Accept bookkeeprr://auth/callback and bookkeeprr:///auth/callback, with or
  // without a trailing slash, terminated by a query/fragment or end of string.
  if (!/^bookkeeprr:\/\/\/?auth\/callback\/?(?=[?#]|$)/.test(url)) {
    return { ok: false, error: 'unexpected deep-link path' };
  }
  const match = /[?&]exchange=([^&#]+)/.exec(url);
  if (!match) return { ok: false, error: 'missing exchange code' };
  return { ok: true, exchangeCode: decodeURIComponent(match[1]!) };
}
