import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { insertUser } from '@/server/db/users';
import { hashPassword } from '@/server/auth/password';
import { POST as loginPOST } from '@/app/api/auth/login/route';
import { POST as exchangePOST } from '@/app/api/mobile/exchange/route';
import { validateReturnTo, appendExchangeCode } from '@/server/mobile/return-to';

async function makeUser(): Promise<{ id: number; username: string; password: string }> {
  const password = 'hunter22-strong-enough';
  const u = await insertUser({
    username: 'alice',
    passwordHash: await hashPassword(password),
    role: 'user',
    mustChangePassword: false,
  });
  return { id: u.id, username: u.username, password };
}

function mkLoginReq(body: unknown): Request {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function mkExchangeReq(code: string): Request {
  return new Request('http://localhost/api/mobile/exchange', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ exchange_code: code }),
  });
}

function extractExchangeCode(redirectUrl: string): string {
  const url = new URL(redirectUrl.replace('bookkeeprr://', 'http://placeholder/'));
  const code = url.searchParams.get('exchange');
  if (code === null) throw new Error(`no exchange param in ${redirectUrl}`);
  return code;
}

describe('validateReturnTo()', () => {
  it('accepts a literal bookkeeprr:// URL', () => {
    expect(validateReturnTo('bookkeeprr://callback')).toBe('bookkeeprr://callback');
  });

  it('accepts paths and query strings under bookkeeprr://', () => {
    const v = 'bookkeeprr://onboarding/complete?source=ios';
    expect(validateReturnTo(v)).toBe(v);
  });

  it('rejects http and https schemes', () => {
    expect(validateReturnTo('http://attacker.example/cb')).toBeNull();
    expect(validateReturnTo('https://attacker.example/cb')).toBeNull();
  });

  it('rejects intent:// and javascript: schemes', () => {
    expect(validateReturnTo('intent://anything')).toBeNull();
    expect(validateReturnTo('javascript:alert(1)')).toBeNull();
  });

  it('rejects scheme spoofing via leading whitespace', () => {
    expect(validateReturnTo(' bookkeeprr://x')).toBeNull();
  });

  it('rejects empty / non-string / oversize input', () => {
    expect(validateReturnTo('')).toBeNull();
    expect(validateReturnTo(undefined)).toBeNull();
    expect(validateReturnTo(null)).toBeNull();
    expect(validateReturnTo(42)).toBeNull();
    expect(validateReturnTo(`bookkeeprr://${'x'.repeat(3000)}`)).toBeNull();
  });
});

describe('appendExchangeCode()', () => {
  it('uses ? when the URL has no query string', () => {
    expect(appendExchangeCode('bookkeeprr://cb', 'abc')).toBe('bookkeeprr://cb?exchange=abc');
  });

  it('uses & when the URL already has a query string', () => {
    expect(appendExchangeCode('bookkeeprr://cb?foo=1', 'abc')).toBe(
      'bookkeeprr://cb?foo=1&exchange=abc',
    );
  });

  it('URL-encodes the exchange code', () => {
    expect(appendExchangeCode('bookkeeprr://cb', 'a/b+c')).toContain('exchange=a%2Fb%2Bc');
  });
});

describe('POST /api/auth/login with return_to (M34)', () => {
  let h: SeedHandle;
  beforeEach(async () => {
    h = await seedDb({ skipDefaultSeries: true });
  });
  afterEach(() => h.cleanup());

  it('happy path: returns redirect_to <return_to>?exchange=<code> and the code is usable', async () => {
    const u = await makeUser();
    const res = await loginPOST(
      mkLoginReq({
        username: u.username,
        password: u.password,
        return_to: 'bookkeeprr://callback',
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { redirect_to?: string; user: { id: number } };
    expect(body.user.id).toBe(u.id);
    expect(body.redirect_to).toBeDefined();
    expect(body.redirect_to!.startsWith('bookkeeprr://callback?exchange=')).toBe(true);

    // The embedded code exchanges cleanly.
    const code = extractExchangeCode(body.redirect_to!);
    const exch = await exchangePOST(mkExchangeReq(code));
    expect(exch.status).toBe(200);
  });

  it('rejects return_to with a non-bookkeeprr scheme as 400 invalid return_to scheme', async () => {
    const u = await makeUser();
    const res = await loginPOST(
      mkLoginReq({
        username: u.username,
        password: u.password,
        return_to: 'https://attacker.example/cb',
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid return_to scheme');
  });

  it('rejects return_to with javascript: as 400', async () => {
    const u = await makeUser();
    const res = await loginPOST(
      mkLoginReq({
        username: u.username,
        password: u.password,
        return_to: 'javascript:alert(1)',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('omits redirect_to when no return_to is supplied (back-compat)', async () => {
    const u = await makeUser();
    const res = await loginPOST(mkLoginReq({ username: u.username, password: u.password }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { redirect_to?: string };
    expect(body.redirect_to).toBeUndefined();
  });

  it('rejects before authenticating: a bad return_to with bad credentials still returns 400', async () => {
    await makeUser();
    const res = await loginPOST(
      mkLoginReq({
        username: 'alice',
        password: 'wrong',
        return_to: 'https://attacker.example/cb',
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login content negotiation (M34)', () => {
  let h: SeedHandle;
  beforeEach(async () => {
    h = await seedDb({ skipDefaultSeries: true });
  });
  afterEach(() => h.cleanup());

  // A no-JS HTML form POST with a valid bookkeeprr:// return_to should
  // get a real HTTP 302. expo-web-browser's openAuthSessionAsync listens
  // for browser navigation events, so a native redirect (no JS, no
  // intermediate page) is the cleanest signal.
  it('emits 302 to <return_to>?exchange=<code> for Accept: text/html form POSTs', async () => {
    const u = await makeUser();
    const formBody = new URLSearchParams({
      username: u.username,
      password: u.password,
      return_to: 'bookkeeprr://callback',
    });
    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: {
        accept: 'text/html',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: formBody.toString(),
    });
    const res = await loginPOST(req);
    expect(res.status).toBe(302);
    const location = res.headers.get('location');
    expect(location).not.toBeNull();
    expect(location!.startsWith('bookkeeprr://callback?exchange=')).toBe(true);
    // Session cookie must still be set so the user stays logged in for
    // subsequent same-origin requests after the deep link dispatches.
    expect(res.headers.get('set-cookie')).not.toBeNull();
    // The embedded code is usable by the mobile exchange endpoint.
    const code = extractExchangeCode(location!);
    const exch = await exchangePOST(mkExchangeReq(code));
    expect(exch.status).toBe(200);
  });

  // The existing <LoginForm> fetch path posts JSON with Content-Type:
  // application/json. It cannot follow a cross-scheme 302 to bookkeeprr://,
  // so the route must keep returning JSON for that caller — even when
  // return_to is present.
  it('keeps JSON branch for Content-Type: application/json requests with return_to', async () => {
    const u = await makeUser();
    const res = await loginPOST(
      mkLoginReq({
        username: u.username,
        password: u.password,
        return_to: 'bookkeeprr://callback',
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { redirect_to?: string; user: { id: number } };
    expect(body.user.id).toBe(u.id);
    expect(body.redirect_to).toBeDefined();
    expect(body.redirect_to!.startsWith('bookkeeprr://callback?exchange=')).toBe(true);
  });

  // Explicit Accept: application/json (e.g. an SPA fetch caller that uses
  // a form-encoded body) also stays on the JSON branch.
  it('keeps JSON branch when Accept: application/json even with form-encoded body', async () => {
    const u = await makeUser();
    const formBody = new URLSearchParams({
      username: u.username,
      password: u.password,
      return_to: 'bookkeeprr://callback',
    });
    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: formBody.toString(),
    });
    const res = await loginPOST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { redirect_to?: string };
    expect(body.redirect_to).toBeDefined();
  });

  // Without return_to, a text/html form POST has no redirect target — we
  // fall back to JSON (the only sensible thing to send). The 302 branch
  // only fires when there is somewhere safe to redirect to.
  it('falls back to JSON for text/html form POST when no return_to is provided', async () => {
    const u = await makeUser();
    const formBody = new URLSearchParams({
      username: u.username,
      password: u.password,
    });
    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: {
        accept: 'text/html',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: formBody.toString(),
    });
    const res = await loginPOST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { id: number }; redirect_to?: string };
    expect(body.user.id).toBe(u.id);
    expect(body.redirect_to).toBeUndefined();
  });
});
